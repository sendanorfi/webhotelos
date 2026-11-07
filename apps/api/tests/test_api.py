import tempfile
import concurrent.futures
from contextlib import closing
import os
import sqlite3
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

from webhotelos_api.app import Config, create_app


class APITest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        config = Config(Path(self.temp.name) / "state.sqlite", "https://panel.example.test", "https://site.example.test")
        self.app = create_app(config)
        self.app.state.store.set_administrator("admin", "synthetic-password-123", reset=False)
        self.client = TestClient(self.app, base_url="https://panel.example.test")
        self.session = self.client.get("/api/v1/session").json()
        self.headers = {"Origin": config.panel_origin, "X-CSRF-Token": self.session["csrf_token"]}

    def tearDown(self):
        self.client.close()
        self.temp.cleanup()

    def login(self, password="synthetic-password-123"):
        return self.client.post("/api/v1/session", headers=self.headers, json={"username": "admin", "password": password})

    def test_access_login_rotation_and_logout(self):
        self.assertEqual(self.client.get("/api/v1/status").status_code, 401)
        old_cookie = self.client.cookies.get("__Host-webhotelos")
        self.assertEqual(self.login("wrong").status_code, 401)
        result = self.login()
        self.assertEqual(result.status_code, 200)
        self.assertNotEqual(old_cookie, self.client.cookies.get("__Host-webhotelos"))
        self.assertNotEqual(self.session["csrf_token"], result.json()["csrf_token"])
        self.assertIn("HttpOnly", result.headers["set-cookie"])
        self.assertIn("Secure", result.headers["set-cookie"])
        self.assertIn("SameSite=strict", result.headers["set-cookie"])
        self.assertNotIn("Domain=", result.headers["set-cookie"])
        self.assertEqual(self.client.get("/api/v1/status").json()["wordpress"]["status"], "unknown")
        self.headers["X-CSRF-Token"] = result.json()["csrf_token"]
        self.assertEqual(self.client.delete("/api/v1/session", headers=self.headers).status_code, 204)
        self.assertEqual(self.client.get("/api/v1/status").status_code, 401)

    def test_rejects_origin_csrf_and_unsafe_validation_echo(self):
        request = {"username": "admin", "password": "synthetic-password-123"}
        self.assertEqual(self.client.post("/api/v1/session", json=request).status_code, 403)
        self.assertEqual(self.client.post("/api/v1/session", headers={**self.headers, "Origin": "https://evil.example"}, json=request).status_code, 403)
        self.assertEqual(self.client.post("/api/v1/session", headers={**self.headers, "X-CSRF-Token": "bad"}, json=request).status_code, 403)
        invalid = self.client.post("/api/v1/session", headers=self.headers, json={"username": "x", "password": "secret" * 1000})
        self.assertEqual(invalid.status_code, 422)
        self.assertNotIn("secret", invalid.text)

    def test_reset_revokes_sessions(self):
        self.assertEqual(self.login().status_code, 200)
        self.app.state.store.set_administrator("admin", "another-synthetic-password", reset=True)
        self.assertEqual(self.client.get("/api/v1/status").status_code, 401)

    def test_login_rate_limit(self):
        for _ in range(5):
            self.assertEqual(self.login("wrong").status_code, 401)
        self.assertEqual(self.login().status_code, 429)

    def test_private_state_and_expired_session(self):
        path = self.app.state.store.path
        self.assertEqual(os.stat(path).st_mode & 0o777, 0o600)
        cookie = self.client.cookies.get("__Host-webhotelos")
        with closing(sqlite3.connect(path)) as db, db:
            self.assertNotIn(cookie, repr(db.execute("SELECT * FROM sessions").fetchall()))
            password_hash = db.execute("SELECT password_hash FROM administrator").fetchone()[0]
            self.assertTrue(password_hash.startswith("$argon2id$"))
            db.execute("UPDATE sessions SET expires = 0")
        self.assertEqual(self.login().status_code, 403)
        self.assertFalse(self.client.get("/api/v1/session").json()["authenticated"])

    def test_parallel_login_rotates_session_only_once(self):
        token = self.client.cookies.get("__Host-webhotelos")
        store = self.app.state.store
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            futures = [pool.submit(store.authenticate, "admin", "synthetic-password-123", token) for _ in range(2)]
            outcomes = [future.result()[0] for future in futures]
        self.assertCountEqual(outcomes, ["ok", "expired"])

    def test_config_rejects_insecure_remote(self):
        config = Config(Path(self.temp.name) / "other.sqlite", "http://panel.example.test", "http://site.example.test", False)
        with self.assertRaises(ValueError):
            create_app(config)


if __name__ == "__main__":
    unittest.main()
