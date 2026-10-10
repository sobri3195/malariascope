"""Explicit scheduled evaluator. Writes analytical notification outbox, never clinical directives."""

import argparse
import datetime as dt
import hashlib
import json
import time


def index(period, frequency):
    if frequency == "monthly":
        d = dt.datetime.strptime(period, "%Y-%m")
        if d.strftime("%Y-%m") != period:
            raise ValueError("Invalid month")
        return d.year * 12 + d.month - 1
    if frequency == "weekly":
        d = dt.datetime.strptime(period, "%Y-%m-%d")
        if d.weekday() != 0 or d.strftime("%Y-%m-%d") != period:
            raise ValueError("Week must start Monday")
        return (d - dt.datetime(1970, 1, 1)).days // 7
    if frequency == "annual":
        return int(period)
    raise ValueError("Unknown frequency")


def compare(value, c):
    if value is None:
        return False
    op, t = c["operator"], c["value"]
    if op == ">":
        return value > t
    if op == ">=":
        return value >= t
    if op == "<":
        return value < t
    if op == "<=":
        return value <= t
    if op == "=":
        return value == t
    if op == "between":
        return t <= value <= c["upper"]
    if op == "outside range":
        return value < t or value > c["upper"]
    if op == "increased by":
        return value > 0 and value >= t
    if op == "decreased by":
        return value < 0 and -value >= t
    raise ValueError("Unknown operator")


def matches(expression, metrics, previous=None, depth=0):
    if depth > 4:
        raise ValueError("Expression exceeds depth 4")
    if "children" in expression:
        children = expression["children"]
        if not 1 <= len(children) <= 10 or expression.get("join") not in ["AND", "OR"]:
            raise ValueError("Invalid group")
        found = [matches(c, metrics, previous, depth + 1) for c in children]
        return all(found) if expression["join"] == "AND" else any(found)
    import math

    if (
        not isinstance(expression.get("metric"), str)
        or not isinstance(expression.get("value"), (int, float))
        or not math.isfinite(expression["value"])
    ):
        raise ValueError("Finite condition threshold required")
    if expression.get("operator") in ["between", "outside range"] and (
        not isinstance(expression.get("upper"), (int, float))
        or not math.isfinite(expression["upper"])
        or expression["upper"] < expression["value"]
    ):
        raise ValueError("Invalid threshold range")
    value = metrics.get(expression["metric"])
    if expression["operator"] in ["increased by", "decreased by"]:
        baseline = previous.get(expression["metric"]) if previous else None
        value = (
            (value - baseline) / baseline * 100
            if value is not None and baseline is not None and baseline > 0
            else None
        )
    return compare(value, expression)


def evaluate_records(records, expression, frequency, persistence, suppress):
    import math

    seen = set()
    ordered = []
    for r in records:
        if (
            not isinstance(r.get("source"), str)
            or not r["source"].strip()
            or not isinstance(r.get("district"), str)
            or not r["district"].strip()
        ):
            raise ValueError("District and source required")
        if not isinstance(r.get("metrics"), dict) or any(
            v is not None and (not isinstance(v, (float, int)) or not math.isfinite(v))
            for v in r["metrics"].values()
        ):
            raise ValueError("Finite metrics required")
        i = index(r["period"], frequency)
        key = (r["district"].strip().lower(), i)
        if key in seen:
            raise ValueError("Duplicate district period")
        seen.add(key)
        ordered.append((i, r))
    histories = {}
    alerts = []
    for i, r in sorted(ordered, key=lambda x: x[0]):
        d = r["district"].strip().lower()
        prior = histories.get(d)
        adjacent = prior is not None and prior["i"] == i - 1
        matched = matches(
            expression, r["metrics"], prior["metrics"] if adjacent else None
        )
        streak = ((prior["streak"] if adjacent else 0) + 1) if matched else 0
        evidence = (
            ([*prior["evidence"], r] if adjacent else [r])[-persistence:]
            if matched
            else []
        )
        histories[d] = dict(i=i, streak=streak, metrics=r["metrics"], evidence=evidence)
        if streak >= persistence and (not suppress or streak == persistence):
            alerts.append(
                dict(
                    district=r["district"],
                    period=r["period"],
                    frequency=frequency,
                    expression=expression,
                    evidence=evidence,
                    source=r["source"],
                    explanation="Rule matched explicit adjacent periods. Analytical decision support only.",
                )
            )
    return alerts


def tick():
    from services.app import connection, audit

    with connection() as db:
        for job in db.execute("SELECT * FROM jobs WHERE enabled=1").fetchall():
            try:
                alerts = evaluate_records(
                    json.loads(job["records"]),
                    json.loads(job["expression"]),
                    job["frequency"],
                    job["persistence"],
                    bool(job["suppress"]),
                )
                for alert in alerts:
                    payload = json.dumps(alert, sort_keys=True)
                    aid = hashlib.sha256((job["id"] + payload).encode()).hexdigest()
                    db.execute(
                        "INSERT OR IGNORE INTO outbox(id,payload,created) VALUES(?,?,?)",
                        (aid, payload, time.time()),
                    )
                db.execute(
                    "UPDATE jobs SET last_run=? WHERE id=?", (time.time(), job["id"])
                )
            except Exception as e:
                audit(db, "scheduler", "JOB_FAILED", dict(id=job["id"], reason=str(e)))


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--once", action="store_true")
    p.add_argument("--seconds", type=int, default=60)
    a = p.parse_args()
    if a.seconds < 10:
        raise ValueError("Scheduler interval must be at least 10 seconds")
    while True:
        tick()
        if a.once:
            break
        time.sleep(a.seconds)
