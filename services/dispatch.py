"""Explicit administrator-only notification dispatcher. No delivery occurs on import/startup."""

import argparse
import ipaddress
import json
import os
import smtplib
import socket
import urllib.request
from email.message import EmailMessage
from urllib.parse import urlparse
from services.app import connection, audit


def destination(url):
    p = urlparse(url)
    allowed = os.environ.get("MALARIASCOPE_WEBHOOK_HOST", "")
    if (
        p.scheme != "https"
        or p.hostname != allowed
        or p.username
        or p.password
        or p.port not in [None, 443]
    ):
        raise ValueError(
            "Webhook requires explicitly allowed public HTTPS host without credentials"
        )
    for addr in socket.getaddrinfo(p.hostname, 443):
        if not ipaddress.ip_address(addr[4][0]).is_global:
            raise ValueError("Webhook host must resolve to public addresses")
    return url


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        raise ValueError("Webhook redirects are not allowed")


def deliver(payload, channel):
    if channel == "webhook":
        url = destination(os.environ.get("MALARIASCOPE_WEBHOOK_URL", ""))
        request = urllib.request.Request(
            url,
            data=payload.encode(),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.build_opener(NoRedirect).open(
            request, timeout=15
        ) as response:
            if not 200 <= response.status < 300:
                raise ValueError("Webhook delivery failed")
    elif channel == "email":
        host = os.environ["MALARIASCOPE_SMTP_HOST"]
        recipient = os.environ["MALARIASCOPE_ALERT_EMAIL"]
        sender = os.environ["MALARIASCOPE_SMTP_FROM"]
        message = EmailMessage()
        message["Subject"] = "MALARIASCOPE analytical signal"
        message["From"] = sender
        message["To"] = recipient
        message.set_content("Analytical decision support only.\n" + payload)
        with smtplib.SMTP_SSL(
            host, int(os.environ.get("MALARIASCOPE_SMTP_PORT", "465")), timeout=15
        ) as smtp:
            smtp.login(
                os.environ["MALARIASCOPE_SMTP_USER"],
                os.environ["MALARIASCOPE_SMTP_PASSWORD"],
            )
            smtp.send_message(message)
    else:
        raise ValueError("Unsupported channel")


def dispatch(channel):
    with connection() as db:
        rows = db.execute("SELECT * FROM outbox WHERE status='PENDING'").fetchall()
    for row in rows:
        with connection() as db:
            claimed = db.execute(
                "UPDATE outbox SET status='SENDING' WHERE id=? AND status='PENDING'",
                (row["id"],),
            ).rowcount
        if not claimed:
            continue
        try:
            deliver(row["payload"], channel)
            with connection() as db:
                db.execute(
                    "UPDATE outbox SET status='DELIVERED' WHERE id=?", (row["id"],)
                )
                audit(
                    db,
                    "dispatcher",
                    "NOTIFICATION_DELIVERED",
                    dict(id=row["id"], channel=channel),
                )
        except Exception:
            with connection() as db:
                db.execute("UPDATE outbox SET status='FAILED' WHERE id=?", (row["id"],))
                audit(
                    db,
                    "dispatcher",
                    "NOTIFICATION_FAILED",
                    dict(id=row["id"], channel=channel),
                )


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--channel", choices=["email", "webhook"], required=True)
    p.add_argument("--deliver", action="store_true")
    a = p.parse_args()
    if not a.deliver:
        raise SystemExit(
            "Delivery disabled. Explicit --deliver and authorized destination configuration required."
        )
    dispatch(a.channel)
