"""Private SQLite state for one local panel administrator."""

import hashlib
import os
import secrets
import sqlite3
import time
from contextlib import contextmanager
from pathlib import Path

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError, VerificationError

HASHER = PasswordHasher()
ANONYMOUS_LIFETIME = 600
SESSION_LIFETIME = 12 * 60 * 60


def digest(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


class Store:
    def __init__(self, path: Path):
        self.path = path
        path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        # SQLite creates files using the process umask. Never rely on the caller's umask.
        old = os.umask(0o077)
        try:
            with self.connect() as db:
                db.executescript("""
                    CREATE TABLE IF NOT EXISTS administrator (
                        id INTEGER PRIMARY KEY CHECK (id = 1),
                        username TEXT NOT NULL,
                        password_hash TEXT NOT NULL
                    );
                    CREATE TABLE IF NOT EXISTS sessions (
                        token_hash TEXT PRIMARY KEY,
                        csrf_token TEXT NOT NULL,
                        authenticated INTEGER NOT NULL,
                        expires INTEGER NOT NULL
                    );
                    CREATE TABLE IF NOT EXISTS login_failures (time INTEGER NOT NULL);
                """)
        finally:
            os.umask(old)
        os.chmod(path, 0o600)
        # This hash equalizes work for nonexistent usernames without storing a password.
        self.dummy_hash = HASHER.hash(secrets.token_urlsafe(32))

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    def session(self, token: str | None):
        if not token or len(token) > 128:
            return None
        with self.connect() as db:
            row = db.execute(
                "SELECT csrf_token, authenticated, expires FROM sessions WHERE token_hash = ? AND expires > ?",
                (digest(token), int(time.time())),
            ).fetchone()
            return dict(row) if row else None

    def new_session(self, authenticated: bool, old_token: str | None = None):
        token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
        now = int(time.time())
        lifetime = SESSION_LIFETIME if authenticated else ANONYMOUS_LIFETIME
        with self.connect() as db:
            db.execute("DELETE FROM sessions WHERE expires <= ?", (now,))
            if old_token:
                db.execute("DELETE FROM sessions WHERE token_hash = ?", (digest(old_token),))
            db.execute(
                "INSERT INTO sessions VALUES (?, ?, ?, ?)",
                (digest(token), csrf, int(authenticated), now + lifetime),
            )
        return token, csrf, lifetime

    def delete_session(self, token: str):
        with self.connect() as db:
            db.execute("DELETE FROM sessions WHERE token_hash = ?", (digest(token),))

    def authenticate(self, username: str, password: str, old_token: str) -> tuple:
        """Return ok, invalid or limited. Limit is global to avoid proxy IP spoofing."""
        now = int(time.time())
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            db.execute("DELETE FROM login_failures WHERE time <= ?", (now - 600,))
            old = db.execute(
                "SELECT 1 FROM sessions WHERE token_hash = ? AND expires > ?",
                (digest(old_token), now),
            ).fetchone()
            if not old:
                return ("expired",)
            count = db.execute("SELECT count(*) FROM login_failures").fetchone()[0]
            if count >= 5:
                return ("limited",)
            row = db.execute("SELECT username, password_hash FROM administrator WHERE id = 1").fetchone()
            candidate = row["password_hash"] if row and username == row["username"] else self.dummy_hash
            try:
                valid = HASHER.verify(candidate, password)
            except (VerifyMismatchError, VerificationError, InvalidHashError):
                valid = False
            if not row or username != row["username"] or not valid:
                db.execute("INSERT INTO login_failures VALUES (?)", (now,))
                return ("invalid",)
            if HASHER.check_needs_rehash(candidate):
                db.execute("UPDATE administrator SET password_hash = ? WHERE id = 1", (HASHER.hash(password),))
            db.execute("DELETE FROM login_failures")
            token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
            db.execute("DELETE FROM sessions WHERE token_hash = ?", (digest(old_token),))
            db.execute("INSERT INTO sessions VALUES (?, ?, 1, ?)",
                       (digest(token), csrf, now + SESSION_LIFETIME))
            return "ok", token, csrf, SESSION_LIFETIME

    def change_password(self, token: str, current_password: str, new_password: str) -> str:
        """Verify the current credential and revoke all sessions in one transaction."""
        now = int(time.time())
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            session = db.execute(
                "SELECT 1 FROM sessions WHERE token_hash = ? AND authenticated = 1 AND expires > ?",
                (digest(token), now),
            ).fetchone()
            if not session:
                return "expired"
            db.execute("DELETE FROM login_failures WHERE time <= ?", (now - 600,))
            if db.execute("SELECT count(*) FROM login_failures").fetchone()[0] >= 5:
                return "limited"
            row = db.execute("SELECT password_hash FROM administrator WHERE id = 1").fetchone()
            try:
                valid = bool(row) and HASHER.verify(row["password_hash"], current_password)
            except (VerifyMismatchError, VerificationError, InvalidHashError):
                valid = False
            if not valid:
                db.execute("INSERT INTO login_failures VALUES (?)", (now,))
                return "invalid"
            db.execute("UPDATE administrator SET password_hash = ? WHERE id = 1", (HASHER.hash(new_password),))
            db.execute("DELETE FROM sessions")
            db.execute("DELETE FROM login_failures")
            return "ok"

    def username(self):
        with self.connect() as db:
            row = db.execute("SELECT username FROM administrator WHERE id = 1").fetchone()
            return row["username"] if row else None

    def set_administrator(self, username: str, password: str, *, reset: bool):
        if not username.strip() or len(username) > 128 or username != username.strip():
            raise ValueError("Username must contain 1 to 128 characters without surrounding whitespace")
        if len(password) < 12 or len(password) > 1024:
            raise ValueError("Password must contain 12 to 1024 characters")
        password_hash = HASHER.hash(password)
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            current = db.execute("SELECT username FROM administrator WHERE id = 1").fetchone()
            if reset and not current:
                raise ValueError("Administrator has not been initialized")
            if not reset and current:
                raise ValueError("Administrator is already initialized")
            if reset:
                db.execute("UPDATE administrator SET password_hash = ? WHERE id = 1", (password_hash,))
            else:
                db.execute("INSERT INTO administrator VALUES (1, ?, ?)", (username, password_hash))
            db.execute("DELETE FROM sessions")
            db.execute("DELETE FROM login_failures")
