# Browser path against the real local panel and API; all credentials are created at runtime.
{
  pkgs,
  panelPackage,
  apiPackage,
}:
let
  browserPython = pkgs.python3.withPackages (p: [ p.playwright ]);
in
pkgs.testers.runNixOSTest {
  name = "webhotelos-panel-browser";
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
      panelOrigin = "http://localhost:8080";
      siteHostName = "site.example.test";
      siteUrl = "http://site.example.test";
      localHTTP = true;
      inherit panelPackage apiPackage;
    };
    users.users.browser-test = {
      isNormalUser = true;
      createHome = true;
    };
    environment.systemPackages = [
      browserPython
      pkgs.util-linux
    ];
    environment.variables.PLAYWRIGHT_BROWSERS_PATH = pkgs.playwright-driver.browsers-chromium;
    virtualisation.memorySize = 3072;
  };
  testScript = ''
    machine.start()
    machine.wait_for_unit("nginx.service")
    machine.wait_for_unit("webhotelos-api.service")
    machine.wait_for_unit("phpfpm-webhotelos-site.service")
    machine.wait_until_succeeds("python3 -c 'import urllib.request; urllib.request.urlopen(\"http://127.0.0.1:8765/api/v1/health\")' >/dev/null 2>&1", timeout=90)
    # Chromium must run as an unprivileged user with the sandbox enabled.
    machine.succeed("runuser -u browser-test -- unshare -Ur true")
    machine.succeed("""cat > /tmp/panel-browser-test.py <<'PY'
    import sys
    from playwright.sync_api import expect, sync_playwright

    password = sys.stdin.readline().rstrip("\\n")
    if not password:
        print("Browser credential input missing", file=sys.stderr)
        sys.exit(1)
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(channel="chromium", headless=True, chromium_sandbox=True)
            context = browser.new_context()
            page = context.new_page()
            browser_errors = []
            page.on("pageerror", lambda _error: browser_errors.append("page error"))
            page.on("console", lambda message: browser_errors.append("console error") if message.type == "error" else None)
            page.goto("http://localhost:8080/", wait_until="domcontentloaded")
            expect(page.get_by_role("heading", name="Sign in")).to_be_visible()
            page.get_by_label("Username").fill("browser-admin")
            page.get_by_label("Password", exact=True).fill(password)
            page.get_by_role("button", name="Sign in").click()
            expect(page.get_by_role("heading", name="Overview")).to_be_visible()
            expect(page.get_by_role("heading", name="Server")).to_be_visible()
            expect(page.get_by_role("listitem").filter(has_text="nginx")).to_contain_text("active")
            expect(page.get_by_role("listitem").filter(has_text="php fpm")).to_contain_text("active")
            page.get_by_role("button", name="Sign out").click()
            expect(page.get_by_role("heading", name="Sign in")).to_be_visible()
            assert not browser_errors
            context.close()
            browser.close()
    except Exception:
        # Playwright exception and action logs can contain the entered password.
        print("Browser interaction failed", file=sys.stderr)
        sys.exit(1)
    print("Browser login, status, and logout passed")
    PY
    cat > /tmp/panel-browser-bootstrap.py <<'PY'
    import secrets
    import subprocess
    import sys

    password = secrets.token_urlsafe(32)
    init = subprocess.run(["webhotelos-admin", "init", "--password-stdin"], input="browser-admin\\n" + password + "\\n", text=True, capture_output=True, check=False)
    if init.returncode != 0:
        print("Panel administrator initialization failed", file=sys.stderr)
        sys.exit(1)
    browser = subprocess.run(["runuser", "-u", "browser-test", "--", "${browserPython}/bin/python3", "/tmp/panel-browser-test.py"], input=password + "\\n", text=True, capture_output=True, check=False)
    if browser.returncode != 0:
        # Do not forward browser logs or exceptions, which may contain secrets.
        print("Browser integration failed", file=sys.stderr)
        sys.exit(1)
    print("Real browser integration passed")
    PY
    python3 /tmp/panel-browser-bootstrap.py""")
  '';
}
