"""HTTP API. Deploy behind the dedicated panel Nginx virtual host only."""

import hmac
import logging
import os
import shutil
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlsplit

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from .status import service_statuses
from .store import Store

LOG = logging.getLogger("webhotelos.audit")


@dataclass(frozen=True)
class Config:
    state_file: Path
    panel_origin: str
    site_url: str
    secure_cookie: bool = True
    version: str = "0.1.0-alpha"

    @classmethod
    def from_env(cls):
        return cls(
            state_file=Path(os.environ["WEBHOTELOS_STATE_FILE"]),
            panel_origin=os.environ["WEBHOTELOS_PANEL_ORIGIN"],
            site_url=os.environ["WEBHOTELOS_SITE_URL"],
            secure_cookie=os.environ.get("WEBHOTELOS_INSECURE_LOCAL_HTTP") != "1",
        )

    def validate(self):
        for value in (self.panel_origin, self.site_url):
            url = urlsplit(value)
            if url.scheme not in ("http", "https") or not url.hostname or url.username or url.password or url.query or url.fragment:
                raise ValueError("Invalid configured URL")
            if url.path not in ("", "/"):
                raise ValueError("Configured URLs cannot contain a path")
        panel = urlsplit(self.panel_origin)
        if self.panel_origin.endswith("/"):
            raise ValueError("Panel origin cannot end in a slash")
        if self.secure_cookie and (panel.scheme != "https" or urlsplit(self.site_url).scheme != "https"):
            raise ValueError("Production panel and site URLs must use HTTPS")
        if not self.secure_cookie and (panel.scheme != "http" or panel.hostname not in ("localhost", "127.0.0.1", "::1")):
            raise ValueError("Insecure cookies are allowed only on a loopback HTTP origin")
        if urlsplit(self.site_url).hostname == panel.hostname:
            raise ValueError("The panel and site must use separate hostnames")


class Login(BaseModel):
    username: str = Field(min_length=1, max_length=128)
    password: str = Field(min_length=1, max_length=1024, repr=False)


class PasswordChange(BaseModel):
    current_password: str = Field(min_length=1, max_length=1024, repr=False)
    new_password: str = Field(min_length=12, max_length=1024, repr=False)


def create_app(config: Config | None = None) -> FastAPI:
    config = config or Config.from_env()
    config.validate()
    store = Store(config.state_file)
    cookie_name = "__Host-webhotelos" if config.secure_cookie else "webhotelos-dev"
    app = FastAPI(title="WebhotelOS API", version=config.version, docs_url=None, redoc_url=None)
    app.state.store = store

    @app.middleware("http")
    async def security(request: Request, call_next):
        if request.method in {"POST", "PUT", "PATCH", "DELETE"}:
            if request.headers.get("origin") != config.panel_origin:
                return JSONResponse({"detail": "Invalid origin"}, status_code=403)
            token = request.cookies.get(cookie_name)
            session = store.session(token)
            csrf = request.headers.get("x-csrf-token", "")
            if not session or not hmac.compare_digest(session["csrf_token"].encode(), csrf.encode()):
                return JSONResponse({"detail": "Invalid CSRF token"}, status_code=403)
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response

    @app.exception_handler(RequestValidationError)
    async def invalid_request(_request: Request, _exc: RequestValidationError):
        # Do not echo sensitive input back in validation errors.
        return JSONResponse({"detail": "Invalid request"}, status_code=422)

    def set_cookie(response: Response, token: str, age: int):
        response.set_cookie(cookie_name, token, max_age=age, httponly=True, secure=config.secure_cookie, samesite="strict", path="/")

    def session_or_401(request: Request):
        row = store.session(request.cookies.get(cookie_name))
        if not row or not row["authenticated"]:
            raise HTTPException(status_code=401, detail="Authentication required")
        return row

    @app.get("/api/v1/health")
    def health():
        return {"status": "ok"}

    @app.get("/api/v1/session")
    def get_session(request: Request, response: Response):
        token = request.cookies.get(cookie_name)
        session = store.session(token)
        if not session:
            token, csrf, age = store.new_session(False)
            set_cookie(response, token, age)
            return {"authenticated": False, "csrf_token": csrf}
        result = {"authenticated": bool(session["authenticated"]), "csrf_token": session["csrf_token"]}
        if result["authenticated"]:
            result["username"] = store.username()
        return result

    @app.post("/api/v1/session")
    def login(body: Login, request: Request, response: Response):
        result = store.authenticate(body.username, body.password, request.cookies[cookie_name])
        outcome = result[0]
        LOG.info("operation=login result=%s", outcome)
        if outcome == "expired":
            raise HTTPException(status_code=403, detail="Session expired")
        if outcome == "limited":
            raise HTTPException(status_code=429, detail="Too many attempts; try again later")
        if outcome != "ok":
            raise HTTPException(status_code=401, detail="Invalid credentials")
        _, token, csrf, age = result
        set_cookie(response, token, age)
        return {"authenticated": True, "csrf_token": csrf, "username": body.username}

    @app.delete("/api/v1/session", status_code=204)
    def logout(request: Request, response: Response):
        session_or_401(request)
        store.delete_session(request.cookies[cookie_name])
        response.delete_cookie(cookie_name, path="/", secure=config.secure_cookie, httponly=True, samesite="strict")
        response.status_code = 204
        LOG.info("operation=logout result=success")
        return response

    @app.post("/api/v1/account/password", status_code=204)
    def change_password(body: PasswordChange, request: Request, response: Response):
        session_or_401(request)
        outcome = store.change_password(request.cookies[cookie_name], body.current_password, body.new_password)
        LOG.info("operation=change_password result=%s", outcome)
        if outcome == "expired":
            raise HTTPException(status_code=401, detail="Authentication required")
        if outcome == "limited":
            raise HTTPException(status_code=429, detail="Too many attempts; try again later")
        if outcome != "ok":
            raise HTTPException(status_code=401, detail="Invalid credentials")
        response.delete_cookie(cookie_name, path="/", secure=config.secure_cookie, httponly=True, samesite="strict")
        response.status_code = 204
        return response

    @app.get("/api/v1/status")
    def status(request: Request):
        session_or_401(request)
        site = config.site_url.rstrip("/")
        return {
            "version": config.version,
            "disk_free_bytes": shutil.disk_usage(config.state_file.parent).free,
            "services": service_statuses(),
            "wordpress": {"status": "unknown", "site_url": site, "admin_url": site + "/wp-admin/"},
        }

    return app
