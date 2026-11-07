# This test exercises the experimental WordPress service, not the full MVP.
{ pkgs }:
pkgs.testers.runNixOSTest {
  name = "webhotelos-wordpress-boundaries";
  nodes.machine =
    { ... }:
    {
      imports = [ ../modules/wordpress.nix ];
      webhotelos.wordpress = {
        enable = true;
        hostName = "site.example.test";
        localHTTP = true;
      };
      virtualisation.memorySize = 2048;
      environment.systemPackages = [ pkgs.curl ];
    };
  testScript = ''
    machine.start()
    machine.wait_for_unit("nginx.service")
    machine.wait_for_unit("mysql.service")
    machine.wait_for_unit("phpfpm-wordpress-site.example.test.service")
    machine.wait_until_succeeds("test -s /var/lib/wordpress/site.example.test/secret-keys.php")

    curl = "curl --noproxy '*' -sS -o /dev/null -w '%{http_code}' -H 'Host: site.example.test'"
    # The real initializer does not exist yet. Without its marker, neither
    # WordPress nor its public install wizard may be used.
    assert machine.succeed(f"{curl} http://127.0.0.1/").strip() == "503"
    assert machine.succeed(f"{curl} http://127.0.0.1/wp-admin/install.php").strip() == "503"
    machine.succeed("test -s /var/lib/wordpress/site.example.test/secret-keys.php")
    machine.succeed("ss -ltn | grep -q '127.0.0.1:80 '")
    machine.fail("ss -ltn | grep -E '[:.]3306\\b'")

    # Simulate only the gate opening to test the location ordering. This does
    # not install WordPress or establish the initializer's correctness.
    machine.succeed("touch /var/lib/wordpress/site.example.test/initialized")
    machine.succeed("echo '<?php echo \"WEBHOTELOS_PHP_EXECUTED\"; ?>' > /var/lib/wordpress/site.example.test/uploads/probe.php")
    assert machine.succeed(f"{curl} http://127.0.0.1/wp-content/uploads/probe.php").strip() == "403"
    assert machine.succeed(f"{curl} http://127.0.0.1/wp-config.php").strip() == "404"
    assert machine.succeed(f"{curl} http://127.0.0.1/wp-admin/install.php").strip() == "404"
  '';
}
