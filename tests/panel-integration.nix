# Exercise the local panel and its real API with runtime-only credentials.
{
  pkgs,
  panelPackage,
  apiPackage,
}:
pkgs.testers.runNixOSTest {
  name = "webhotelos-panel-integration";
  nodes.machine = {
    imports = [
      ../modules/php-site.nix
      ../modules/panel.nix
    ];
    webhotelos.phpSite = {
      enable = true;
      hostName = "site.example.test";
    };
    webhotelos.panel = {
      enable = true;
      hostName = "localhost";
      siteHostName = "site.example.test";
      siteUrl = "http://site.example.test";
      panelOrigin = "http://localhost:8080";
      localHTTP = true;
      adminAuthorizedKeys = [ ];
      inherit panelPackage apiPackage;
    };
    environment.systemPackages = [
      pkgs.python3
      pkgs.openssh
    ];
    virtualisation.memorySize = 1536;
  };
  testScript = ''
    machine.start()
    machine.wait_for_unit("nginx.service")
    machine.wait_for_unit("webhotelos-api.service")
    machine.wait_for_unit("phpfpm-webhotelos-site.service")
    machine.wait_for_unit("sshd.service")
    machine.succeed("printf '%s\\n' \"<?php echo 'PANEL_TEST_PHP'; ?>\" > /var/lib/webhotelos/site/public/test.php")
    # Secrets and CSRF tokens remain inside the guest process, never in the Nix store,
    # command-line arguments, test driver output, or test source.
    machine.succeed("""cat > /tmp/panel-test.py <<'PY'
    import http.cookiejar
    import json
    import os
    import pathlib
    import pwd
    import secrets
    import subprocess
    import time
    import urllib.error
    import urllib.request

    # Generate the admin key at runtime; never embed its private half in a build.
    key = "/run/panel-integration-key"
    subprocess.run(["ssh-keygen", "-q", "-t", "ed25519", "-N", "", "-f", key], check=True, capture_output=True)
    account = pwd.getpwnam("admin")
    ssh_dir = pathlib.Path(account.pw_dir) / ".ssh"
    ssh_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chown(ssh_dir, account.pw_uid, account.pw_gid)
    os.chmod(ssh_dir, 0o700)
    authorized = ssh_dir / "authorized_keys"
    authorized.write_bytes(pathlib.Path(key + ".pub").read_bytes())
    os.chown(authorized, account.pw_uid, account.pw_gid)
    os.chmod(authorized, 0o600)
    ssh = ["ssh", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null", "-o", "IdentitiesOnly=yes", "-i", key, "admin@localhost"]
    prohibited = subprocess.run(ssh + ["sudo", "-n", "/run/current-system/sw/bin/id"], capture_output=True, check=False)
    assert prohibited.returncode != 0, "Administrator unexpectedly has general sudo access"
    password = secrets.token_urlsafe(32)
    result = subprocess.run(
        ssh + ["sudo", "-n", "/run/current-system/sw/bin/webhotelos-admin", "init", "--password-stdin"],
        input="integration-admin\\n" + password + "\\n",
        text=True,
        capture_output=True,
        check=False,
    )
    assert result.returncode == 0, "Administrator initialization failed"
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), urllib.request.HTTPCookieProcessor(jar))
    origin = "http://localhost:8080"

    def request(path, *, method="GET", payload=None, headers=None, client=opener):
        time.sleep(0.22)
        data = json.dumps(payload).encode() if payload is not None else None
        request_headers = dict(headers or {})
        if data is not None:
            request_headers["Content-Type"] = "application/json"
        req = urllib.request.Request(origin + path, data=data, headers=request_headers, method=method)
        try:
            with client.open(req, timeout=30) as response:
                return response.status, response.read(), response.headers
        except urllib.error.HTTPError as error:
            return error.code, error.read(), error.headers

    assert request("/")[0] == 200
    assert request("/api/v1/status")[0] == 401
    code, body, headers = request("/api/v1/session")
    assert code == 200 and not json.loads(body)["authenticated"]
    assert "httponly" in headers["Set-Cookie"].lower() and "samesite=strict" in headers["Set-Cookie"].lower()
    csrf = json.loads(body)["csrf_token"]
    before = next(iter(jar)).value
    payload = {"username": "integration-admin", "password": password}
    assert request("/api/v1/session", method="POST", payload=payload, headers={"X-CSRF-Token": csrf})[0] == 403
    assert request("/api/v1/session", method="POST", payload=payload, headers={"Origin": origin, "X-CSRF-Token": "invalid"})[0] == 403
    assert request("/api/v1/session", method="POST", payload=payload, headers={"Origin": "http://attacker.example.test", "X-CSRF-Token": csrf})[0] == 403
    wrong_payload = {"username": "integration-admin", "password": "incorrect-test-password"}
    assert request("/api/v1/session", method="POST", payload=wrong_payload, headers={"Origin": origin, "X-CSRF-Token": csrf})[0] == 401
    code, body, _ = request("/api/v1/session", method="POST", payload=payload, headers={"Origin": origin, "X-CSRF-Token": csrf})
    assert code == 200 and json.loads(body)["authenticated"]
    assert next(iter(jar)).value != before
    csrf = json.loads(body)["csrf_token"]
    code, body, _ = request("/api/v1/status")
    assert code == 200 and json.loads(body)["version"]
    services = json.loads(body)["services"]
    assert services["nginx"] == "active" and services["php_fpm"] == "active"
    req = urllib.request.Request("http://127.0.0.1/test.php", headers={"Host": "site.example.test"})
    with opener.open(req, timeout=30) as response:
        assert response.read() == b"PANEL_TEST_PHP"
    other_jar = http.cookiejar.CookieJar()
    other = urllib.request.build_opener(urllib.request.ProxyHandler({}), urllib.request.HTTPCookieProcessor(other_jar))
    code, body, _ = request("/api/v1/session", client=other)
    assert code == 200
    other_csrf = json.loads(body)["csrf_token"]
    assert request("/api/v1/session", method="POST", payload=payload, headers={"Origin": origin, "X-CSRF-Token": other_csrf}, client=other)[0] == 200
    changed_password = secrets.token_urlsafe(32)
    change = {"current_password": password, "new_password": changed_password}
    assert request("/api/v1/account/password", method="POST", payload=change, headers={"Origin": origin, "X-CSRF-Token": "invalid"})[0] == 403
    assert request("/api/v1/account/password", method="POST", payload={"current_password": "incorrect-test-password", "new_password": changed_password}, headers={"Origin": origin, "X-CSRF-Token": csrf})[0] == 401
    assert request("/api/v1/account/password", method="POST", payload=change, headers={"Origin": origin, "X-CSRF-Token": csrf})[0] == 204
    assert request("/api/v1/status")[0] == 401
    assert request("/api/v1/status", client=other)[0] == 401
    code, body, _ = request("/api/v1/session")
    assert code == 200
    csrf = json.loads(body)["csrf_token"]
    assert request("/api/v1/session", method="POST", payload=payload, headers={"Origin": origin, "X-CSRF-Token": csrf})[0] == 401
    payload["password"] = changed_password
    code, body, _ = request("/api/v1/session", method="POST", payload=payload, headers={"Origin": origin, "X-CSRF-Token": csrf})
    assert code == 200
    csrf = json.loads(body)["csrf_token"]
    assert request("/api/v1/session", method="DELETE", headers={"Origin": origin, "X-CSRF-Token": csrf})[0] == 204
    assert request("/api/v1/status")[0] == 401
    print("Local panel, API and PHP integration passed")
    PY
    python3 /tmp/panel-test.py""")
  '';
}
