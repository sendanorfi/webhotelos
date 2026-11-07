# Local API foundation

This is an incomplete backend, not a deployment-ready management service. It implements a single local panel administrator, session handling and a limited status response. It does not implement jobs, WordPress initialization, WordPress application-state discovery, backup or restore.

Run the API only as a dedicated unprivileged service user behind the panel's HTTPS virtual host. Restrict the API listener to loopback or a Unix socket. Terminate TLS at Nginx; do not trust forwarded headers. Configure a request-body size limit and connection/request rate limits at the proxy. Protect the state directory from all other users. The code does not configure Nginx, systemd or these limits.

The factory `webhotelos_api.app:create_app` reads these environment variables:

- `WEBHOTELOS_STATE_FILE`: absolute path to the private SQLite state file.
- `WEBHOTELOS_PANEL_ORIGIN`: exact HTTPS origin without a trailing slash, for example `https://panel.example.test`.
- `WEBHOTELOS_SITE_URL`: HTTPS origin with a different hostname, for example `https://site.example.test`.
- `WEBHOTELOS_INSECURE_LOCAL_HTTP=1`: optional test-only mode; the panel origin must use HTTP on `localhost`, `127.0.0.1` or `::1`. Production must not set this option.

Run `python -m webhotelos_api.admin init` as the same service user to create the panel administrator. `reset-password` changes the password and invalidates all sessions. Interactive passwords are read without terminal echo. `--password-stdin` reads a single line without printing it; for `init`, the username is read first, so non-interactive input supplies the username line followed by the password line. Never pass a password in arguments, environment variables or logs. There is no default credential.

The FastAPI OpenAPI document is generated at `/openapi.json`. All paths below start with `/api/v1`:

- `GET /health`: public liveness only.
- `GET /session`: establishes an anonymous session when needed and returns `authenticated` and `csrf_token`; authenticated responses include `username`.
- `POST /session`: accepts `username` and `password`; returns the rotated session and CSRF token. Wrong credentials return 401; five failures in ten minutes impose a global temporary 429 limit. The global limit is independent of proxy-supplied client addresses.
- `DELETE /session`: invalidates the authenticated session and returns 204.
- `POST /account/password`: accepts `current_password` and `new_password` (12 to 1024 characters), verifies the current credential, and atomically revokes every session upon success. It returns 204 and requires another login. This operation shares the login failure rate limit.
- `GET /status`: requires authentication. Reports version, free bytes, fixed systemd service states and WordPress status `unknown`, together with the configured site and admin URLs. The service names match the experimental PHP-site profile. An unavailable systemd query returns `unknown`. The API does not yet inspect WordPress itself.

Every state-changing request, including login, requires the exact `Origin` and the current `X-CSRF-Token`. The session token is an HTTP-only, host-only, SameSite=Strict cookie, Secure in HTTPS mode. Sessions expire and are stored server-side by a hash of the cookie. Passwords use Argon2id through `argon2-cffi`. This foundation has not received an independent security review.

With FastAPI, argon2-cffi and httpx available, run:

```sh
PYTHONPATH=apps/api python -m unittest discover -s apps/api/tests -v
```
