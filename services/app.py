"""Optional authenticated workspace service. Run behind same-origin HTTPS in production."""

import hashlib
import hmac
import json
import os
import secrets
import sqlite3
import time
from pathlib import Path
from fastapi import FastAPI, HTTPException, Request, Response
from pydantic import BaseModel, Field

DB = Path(os.environ.get("MALARIASCOPE_DB", "/tmp/malariascope-service.sqlite3"))
app = FastAPI(title="MALARIASCOPE research services", docs_url=None, redoc_url=None)


def connection():
    DB.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB, timeout=10)
    db.row_factory = sqlite3.Row
    db.executescript(
        """
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,password TEXT NOT NULL,salt TEXT NOT NULL,role TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,user TEXT,csrf TEXT,expires REAL);
    CREATE TABLE IF NOT EXISTS workspace(id TEXT PRIMARY KEY,revision INTEGER,payload TEXT);
    CREATE TABLE IF NOT EXISTS revisions(id INTEGER PRIMARY KEY AUTOINCREMENT,workspace TEXT,revision INTEGER,payload TEXT,actor TEXT,time REAL);
    CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT,actor TEXT,event TEXT,details TEXT,time REAL);
    CREATE TABLE IF NOT EXISTS forecasts(id TEXT PRIMARY KEY,payload TEXT,locked INTEGER DEFAULT 0,registered REAL);
    CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,expression TEXT,records TEXT,frequency TEXT,persistence INTEGER,suppress INTEGER,enabled INTEGER,last_run REAL);
    CREATE TABLE IF NOT EXISTS outbox(id TEXT PRIMARY KEY,payload TEXT,status TEXT DEFAULT 'PENDING',created REAL);
    """
    )
    return db


def audit(db, user, event, details):
    db.execute(
        "INSERT INTO audit(actor,event,details,time) VALUES(?,?,?,?)",
        (user, event, json.dumps(details), time.time()),
    )


def password_hash(password, salt):
    return hashlib.scrypt(
        password.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1
    ).hex()


def create_user(username, password, role):
    if role not in ["RESEARCHER", "ANALYST", "VIEWER"] or len(password) < 12:
        raise ValueError("Role invalid or password shorter than 12 characters")
    salt = secrets.token_hex(16)
    with connection() as db:
        db.execute(
            "INSERT INTO users VALUES(?,?,?,?)",
            (username, password_hash(password, salt), salt, role),
        )


def actor(request, write=False):
    token = request.cookies.get("malariascope_session", "")
    with connection() as db:
        row = db.execute(
            "SELECT u.id,u.role,s.csrf FROM sessions s JOIN users u ON s.user=u.id WHERE s.hash=? AND s.expires>?",
            (hashlib.sha256(token.encode()).hexdigest(), time.time()),
        ).fetchone()
    if not row:
        raise HTTPException(401, "Sign in required")
    if write:
        if row["role"] == "VIEWER":
            raise HTTPException(403, "Read-only role")
        if not hmac.compare_digest(
            request.headers.get("x-csrf-token", ""), row["csrf"]
        ):
            raise HTTPException(403, "Invalid CSRF token")
    return dict(row)


@app.middleware("http")
async def limits(request: Request, call_next):
    if int(request.headers.get("content-length", "0") or "0") > 20_000_000:
        return Response("Request exceeds 20 MB", 413)
    if request.method not in ["GET", "HEAD", "OPTIONS"]:
        origin = request.headers.get("origin")
        expected = os.environ.get("MALARIASCOPE_ORIGIN")
        if origin and (
            expected
            and origin != expected
            or not expected
            and origin != str(request.base_url).rstrip("/")
        ):
            return Response("Same-origin request required", 403)
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


@app.get("/api/health")
def health():
    return dict(
        service="malariascope-research-service",
        status="AVAILABLE",
        schema=1,
        clinicalValidation=False,
    )


class Login(BaseModel):
    username: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=1, max_length=300)


# Rate limits are local to this process; use reverse-proxy limits in production.
attempts = {}


@app.post("/api/login")
def login(data: Login, request: Request, response: Response):
    key = request.client.host if request.client else "unknown"
    now = time.time()
    history = [x for x in attempts.get(key, []) if now - x < 300]
    if len(history) >= 10:
        raise HTTPException(429, "Too many attempts; retry later")
    history.append(now)
    attempts[key] = history
    with connection() as db:
        row = db.execute("SELECT * FROM users WHERE id=?", (data.username,)).fetchone()
        salt = row["salt"] if row else "00" * 16
        candidate = password_hash(data.password, salt)
        if not row or not hmac.compare_digest(candidate, row["password"]):
            raise HTTPException(401, "Invalid credentials")
        token = secrets.token_urlsafe(32)
        csrf = secrets.token_urlsafe(32)
        db.execute("DELETE FROM sessions WHERE expires<?", (now,))
        db.execute(
            "INSERT INTO sessions VALUES(?,?,?,?)",
            (hashlib.sha256(token.encode()).hexdigest(), row["id"], csrf, now + 28800),
        )
        audit(db, row["id"], "SIGN_IN", {})
    response.set_cookie(
        "malariascope_session",
        token,
        httponly=True,
        secure=os.environ.get("MALARIASCOPE_SECURE_COOKIE", "1") == "1",
        samesite="strict",
        max_age=28800,
        path="/api",
    )
    return dict(user=row["id"], role=row["role"], csrf=csrf)


@app.get("/api/me")
def me(request: Request):
    return actor(request)


@app.post("/api/logout")
def logout(request: Request, response: Response):
    user = actor(request, True)
    with connection() as db:
        db.execute(
            "DELETE FROM sessions WHERE hash=?",
            (
                hashlib.sha256(
                    request.cookies["malariascope_session"].encode()
                ).hexdigest(),
            ),
        )
        audit(db, user["id"], "SIGN_OUT", {})
    response.delete_cookie("malariascope_session", path="/api")
    return dict(status="SIGNED_OUT")


@app.get("/api/workspace")
def read_workspace(request: Request):
    actor(request)
    with connection() as db:
        r = db.execute(
            "SELECT revision,payload FROM workspace WHERE id='shared'"
        ).fetchone()
    return dict(
        revision=r["revision"] if r else 0,
        workspace=json.loads(r["payload"]) if r else None,
    )


class Workspace(BaseModel):
    expectedRevision: int = Field(ge=0)
    workspace: dict


@app.put("/api/workspace")
def write_workspace(data: Workspace, request: Request):
    user = actor(request, True)
    if not isinstance(data.workspace.get("datasets"), list):
        raise HTTPException(422, "Workspace datasets required")
    payload = json.dumps(data.workspace, allow_nan=False)
    with connection() as db:
        db.execute("BEGIN IMMEDIATE")
        r = db.execute("SELECT revision FROM workspace WHERE id='shared'").fetchone()
        revision = r["revision"] if r else 0
        if revision != data.expectedRevision:
            raise HTTPException(409, "Revision conflict; load latest before saving")
        revision += 1
        db.execute(
            "INSERT OR REPLACE INTO workspace VALUES('shared',?,?)", (revision, payload)
        )
        db.execute(
            "INSERT INTO revisions(workspace,revision,payload,actor,time) VALUES('shared',?,?,?,?)",
            (revision, payload, user["id"], time.time()),
        )
        audit(db, user["id"], "WORKSPACE_SAVED", dict(revision=revision))
    return dict(revision=revision)


@app.get("/api/revisions")
def revisions(request: Request):
    actor(request)
    with connection() as db:
        return [
            dict(r)
            for r in db.execute(
                "SELECT id,revision,actor,time FROM revisions ORDER BY id DESC LIMIT 100"
            )
        ]


@app.get("/api/revisions/{revision}")
def revision(revision: int, request: Request):
    actor(request)
    with connection() as db:
        r = db.execute(
            "SELECT payload FROM revisions WHERE revision=?", (revision,)
        ).fetchone()
    if not r:
        raise HTTPException(404, "Revision unavailable")
    return dict(workspace=json.loads(r["payload"]))


@app.get("/api/audit")
def audit_log(request: Request):
    actor(request)
    with connection() as db:
        return [
            dict(r)
            for r in db.execute("SELECT * FROM audit ORDER BY id DESC LIMIT 500")
        ]


class Forecast(BaseModel):
    district: str
    model: str
    model_version: str
    target_start: float = Field(allow_inf_nan=False)
    target_end: float = Field(allow_inf_nan=False)
    data_cutoff: float = Field(allow_inf_nan=False)
    prediction: float = Field(ge=0, allow_inf_nan=False)
    dataset_hash: str = Field(pattern="^[a-fA-F0-9]{64}$")


@app.post("/api/forecasts")
def register_forecast(data: Forecast, request: Request):
    user = actor(request, True)
    now = time.time()
    if not data.data_cutoff <= now < data.target_start < data.target_end:
        raise HTTPException(422, "Require cutoff ≤ registration < target start < end")
    fid = secrets.token_urlsafe(24)
    payload = data.model_dump() | dict(id=fid, registered=now, outcome=None)
    with connection() as db:
        db.execute(
            "INSERT INTO forecasts VALUES(?,?,1,?)", (fid, json.dumps(payload), now)
        )
        audit(
            db,
            user["id"],
            "FORECAST_REGISTERED",
            dict(id=fid, dataset_hash=data.dataset_hash),
        )
    return payload


@app.get("/api/forecasts")
def forecasts(request: Request):
    actor(request)
    with connection() as db:
        return [
            json.loads(r["payload"])
            for r in db.execute("SELECT payload FROM forecasts")
        ]


class Outcome(BaseModel):
    outcome: int = Field(ge=0)


@app.post("/api/forecasts/{fid}/outcome")
def outcome(fid: str, data: Outcome, request: Request):
    user = actor(request, True)
    with connection() as db:
        db.execute("BEGIN IMMEDIATE")
        r = db.execute("SELECT payload FROM forecasts WHERE id=?", (fid,)).fetchone()
        if not r:
            raise HTTPException(404, "Forecast unavailable")
        p = json.loads(r["payload"])
        if p["outcome"] is not None or time.time() < p["target_end"]:
            raise HTTPException(409, "Outcome already recorded or target incomplete")
        p.update(outcome=data.outcome, outcome_received=time.time())
        db.execute("UPDATE forecasts SET payload=? WHERE id=?", (json.dumps(p), fid))
        audit(db, user["id"], "OUTCOME_ATTACHED", dict(id=fid))
    return p


class Job(BaseModel):
    id: str = Field(pattern="^[a-zA-Z0-9_-]{1,100}$")
    expression: dict
    records: list[dict]
    frequency: str = "monthly"
    persistence: int = Field(ge=1, le=3, default=1)
    suppress: bool = True


@app.post("/api/jobs")
def save_job(data: Job, request: Request):
    user = actor(request, True)
    from services.scheduler import evaluate_records

    try:
        evaluate_records(
            data.records,
            data.expression,
            data.frequency,
            data.persistence,
            data.suppress,
        )
    except (ValueError, KeyError, TypeError) as e:
        raise HTTPException(422, str(e))
    with connection() as db:
        db.execute(
            "INSERT OR REPLACE INTO jobs VALUES(?,?,?,?,?,?,1,NULL)",
            (
                data.id,
                json.dumps(data.expression),
                json.dumps(data.records),
                data.frequency,
                data.persistence,
                int(data.suppress),
            ),
        )
        audit(db, user["id"], "JOB_SAVED", dict(id=data.id))
    return dict(
        status="SAVED",
        notificationDelivery="OUTBOX ONLY — delivery requires explicitly configured dispatcher",
    )


@app.get("/api/notifications")
def notifications(request: Request):
    actor(request)
    with connection() as db:
        return [
            dict(r)
            for r in db.execute("SELECT * FROM outbox ORDER BY created DESC LIMIT 100")
        ]
