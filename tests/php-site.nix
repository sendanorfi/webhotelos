# Exercise a runtime-generated SSH key and a real SFTP upload between two VMs.
{ pkgs }:
pkgs.testers.runNixOSTest {
  name = "webhotelos-php-site";
  nodes = {
    server = {
      imports = [ ../modules/php-site.nix ];
      webhotelos.phpSite = {
        enable = true;
        hostName = "site.example.test";
        user = "site";
        listenAddress = "0.0.0.0";
        openFirewall = true;
      };
      virtualisation.memorySize = 1536;
    };
    client = {
      environment.systemPackages = [
        pkgs.curl
        pkgs.openssh
      ];
      virtualisation.memorySize = 512;
    };
  };
  testScript = ''
    import shlex

    server.start(allow_reboot=True)
    client.start()
    server.wait_for_unit("sshd.service")
    server.wait_for_unit("nginx.service")
    client.wait_for_unit("network.target")

    # Generate both identities at runtime. Only the public key leaves the client.
    client.succeed("ssh-keygen -q -t ed25519 -N \"\" -f /root/site-key")
    client.succeed("ssh-keygen -q -t ed25519 -N \"\" -f /root/unauthorized-key")
    public_key = client.succeed("cat /root/site-key.pub").strip()
    server.succeed("install -d -m 0700 -o site -g $(id -gn site) /var/lib/webhotelos/site/.ssh")
    server.succeed(f"printf '%s\\n' {shlex.quote(public_key)} > /var/lib/webhotelos/site/.ssh/authorized_keys")
    server.succeed("chown site: /var/lib/webhotelos/site/.ssh/authorized_keys && chmod 600 /var/lib/webhotelos/site/.ssh/authorized_keys")

    ssh_options = "-o BatchMode=yes -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o IdentitiesOnly=yes"
    client.wait_until_succeeds(f"ssh {ssh_options} -i /root/site-key site@server true")
    client.fail(f"ssh {ssh_options} -i /root/unauthorized-key site@server true")
    client.succeed("printf '%s\\n' \"<?php echo 'WEBHOTELOS_PHP_EXECUTED:' . PHP_VERSION; ?>\" > /tmp/test.php")
    client.succeed("printf '%s\\n' 'put /tmp/test.php /var/lib/webhotelos/site/public/test.php' > /tmp/sftp-batch")
    client.succeed(f"sftp {ssh_options} -i /root/site-key -b /tmp/sftp-batch site@server")

    request = "curl --noproxy '*' -fsS -H 'Host: site.example.test' http://server/test.php"
    client.wait_until_succeeds(f"{request} | grep -E '^WEBHOTELOS_PHP_EXECUTED:8[.]5[.]'")
    assert client.succeed(request).strip().startswith("WEBHOTELOS_PHP_EXECUTED:8.5.")
    server.reboot()
    server.wait_for_unit("sshd.service")
    server.wait_for_unit("nginx.service")
    client.wait_until_succeeds(f"{request} | grep -E '^WEBHOTELOS_PHP_EXECUTED:8[.]5[.]'")
    assert client.succeed(request).strip().startswith("WEBHOTELOS_PHP_EXECUTED:8.5.")
  '';
}
