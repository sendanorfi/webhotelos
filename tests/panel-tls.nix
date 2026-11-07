# Test HTTPS with a certificate and private key created inside the guest at runtime.
{
  pkgs,
  panelPackage,
  apiPackage,
}:
pkgs.testers.runNixOSTest {
  name = "webhotelos-panel-local-tls";
  nodes.machine =
    { lib, ... }:
    {
      imports = [ ../modules/panel.nix ];
      webhotelos.panel = {
        enable = true;
        hostName = "panel.example.test";
        panelOrigin = "https://panel.example.test";
        siteHostName = "site.example.test";
        siteUrl = "https://site.example.test";
        inherit panelPackage apiPackage;
      };
      # ACME needs public DNS; this test uses a local, freshly generated CA cert.
      services.nginx = {
        validateConfigFile = false;
        virtualHosts."panel.example.test" = {
          enableACME = lib.mkForce false;
          forceSSL = lib.mkForce false;
          addSSL = true;
          sslCertificate = "/run/webhotelos-tls-test/cert.pem";
          sslCertificateKey = "/run/webhotelos-tls-test/key.pem";
        };
      };
      systemd.services.webhotelos-test-certificate = {
        before = [ "nginx.service" ];
        requiredBy = [ "nginx.service" ];
        serviceConfig = {
          Type = "oneshot";
          RemainAfterExit = true;
        };
        script = ''
          install -d -m 0750 -o root -g nginx /run/webhotelos-tls-test
          ${pkgs.openssl}/bin/openssl req -x509 -newkey ed25519 -nodes -days 1 \
            -subj '/CN=panel.example.test' -addext 'subjectAltName=DNS:panel.example.test' \
            -keyout /run/webhotelos-tls-test/key.pem -out /run/webhotelos-tls-test/cert.pem \
            >/dev/null 2>&1
          chown root:nginx /run/webhotelos-tls-test/key.pem
          chmod 0640 /run/webhotelos-tls-test/key.pem
        '';
      };
      networking.hosts."127.0.0.1" = [ "panel.example.test" ];
      environment.systemPackages = [ pkgs.python3 ];
      virtualisation.memorySize = 1536;
    };
  testScript = ''
    machine.start()
    machine.wait_for_unit("nginx.service")
    machine.wait_for_unit("webhotelos-api.service")
    machine.wait_until_succeeds("python3 -c 'import urllib.request; urllib.request.urlopen(\"http://127.0.0.1:8765/api/v1/health\")'", timeout=90)
    # Passwords and cookies stay inside the VM process and never enter test output.
    machine.succeed("""cat > /tmp/panel-tls-test.py <<'PY'
    import http.cookiejar
    import json
    import secrets
    import ssl
    import subprocess
    import urllib.error
    import urllib.request

    password = secrets.token_urlsafe(32)
    result = subprocess.run(["webhotelos-admin", "init", "--password-stdin"], input="tls-admin\\n" + password + "\\n", text=True, capture_output=True, check=False)
    assert result.returncode == 0, "Administrator initialization failed"
    context = ssl.create_default_context(cafile="/run/webhotelos-tls-test/cert.pem")
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), urllib.request.HTTPSHandler(context=context), urllib.request.HTTPCookieProcessor(jar))
    origin = "https://panel.example.test"

    def request(path, *, method="GET", payload=None, headers=None):
        data = json.dumps(payload).encode() if payload is not None else None
        request_headers = dict(headers or {})
        if data is not None:
            request_headers["Content-Type"] = "application/json"
        req = urllib.request.Request(origin + path, data=data, headers=request_headers, method=method)
        try:
            with opener.open(req, timeout=30) as response:
                return response.status, response.read(), response.headers
        except urllib.error.HTTPError as error:
            return error.code, error.read(), error.headers

    assert request("/")[0] == 200
    assert request("/api/v1/status")[0] == 401
    code, body, headers = request("/api/v1/session")
    assert code == 200
    cookie = headers["Set-Cookie"].lower()
    assert cookie.startswith("__host-webhotelos=")
    assert "secure" in cookie and "httponly" in cookie and "samesite=strict" in cookie and "path=/" in cookie
    assert "domain=" not in cookie
    csrf = json.loads(body)["csrf_token"]
    credentials = {"username": "tls-admin", "password": password}
    code, body, _ = request("/api/v1/session", method="POST", payload=credentials, headers={"Origin": origin, "X-CSRF-Token": csrf})
    assert code == 200 and json.loads(body)["authenticated"]
    csrf = json.loads(body)["csrf_token"]
    assert request("/api/v1/status")[0] == 200
    assert request("/api/v1/session", method="DELETE", headers={"Origin": origin, "X-CSRF-Token": csrf})[0] == 204
    assert request("/api/v1/status")[0] == 401
    print("Verified local TLS, secure cookie and authenticated API")
    PY
    python3 /tmp/panel-tls-test.py""")
  '';
}
