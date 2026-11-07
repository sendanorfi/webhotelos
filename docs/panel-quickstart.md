# Experimental local management panel

The panel is an early self-hosted management interface for the PHP milestone. It reports fixed service states and free space, links to the configured site, and changes the panel administrator's password. WordPress initialization, backups, restore, application installation and system updates are not implemented. The panel and API do not require a Sites, OpenAI or Cloudflare account at runtime.

This guide extends [the PHP QEMU quickstart](php-quickstart.md). Keep the copied instance flake in a directory containing only non-secret configuration; Nix copies its source to the store. Keep both private SSH keys and all passwords elsewhere. Both the site and the panel administrator need their own public SSH keys.

In the copied instance `flake.nix`, add the panel module and its package settings inside the `modules` list, after `webhotelos.nixosModules.phpSite`:

```nix
webhotelos.nixosModules.panel
{
  webhotelos.panel = {
    enable = true;
    hostName = "localhost";
    panelOrigin = "http://localhost:8081";
    siteHostName = "site.example.test";
    siteUrl = "http://site.example.test:8080";
    localHTTP = true;
    # Replace with the panel administrator's public SSH key.
    adminAuthorizedKeys = [ "ssh-ed25519 REPLACE_WITH_ADMIN_PUBLIC_KEY" ];
    panelPackage = webhotelos.packages.x86_64-linux.panel;
    apiPackage = webhotelos.packages.x86_64-linux.api;
  };
}
```

The site key in `configuration.nix` is separate. Build the instance and start its disk using the PHP quickstart. The `admin` account is separate from `site`. It can run only the fixed `webhotelos-admin` command with passwordless sudo; it does not get general root or wheel access. Replace `~/.ssh/id_ed25519` in the following commands with the administrator's private key path. After verifying the VM's SSH host key out of band, initialize the local panel administrator over SSH:

```sh
ssh -t -p 2222 -i ~/.ssh/id_ed25519 admin@127.0.0.1 'sudo /run/current-system/sw/bin/webhotelos-admin init'
```

Choose the panel username and a password interactively. No default password exists. To reset the password from the same authorized SSH session, run `sudo /run/current-system/sw/bin/webhotelos-admin reset-password`; all panel sessions are revoked. The panel account is separate from both Unix accounts and any future WordPress account.

In another terminal, create a loopback-only SSH tunnel and leave it running:

```sh
ssh -N -p 2222 -i ~/.ssh/id_ed25519 -L 127.0.0.1:8081:127.0.0.1:8080 admin@127.0.0.1
```

Open `http://localhost:8081` on the same host. `localhost` and port `8081` must match `panelOrigin` exactly for login and CSRF protection. The panel listener and API listener are on the guest's loopback interface; do not expose the local HTTP panel publicly. The configured site link uses `site.example.test:8080`, which needs local name resolution for a browser; the PHP quickstart uses `curl --resolve` without changing DNS.

For an Internet-facing panel, the module can configure HTTPS and ACME for a separate hostname, but that profile is not a tested production deployment. DNS, ACME, firewall policy, backups and operational review remain necessary. The site itself also needs HTTPS before public use. The API runs as `webhotelos-api`, its SQLite state lives in `/var/lib/webhotelos-api`, and the panel is served by Nginx from its immutable package. The site contents remain under `/var/lib/webhotelos/site/public`.

From the repository, `nix build .#panel-integration-test .#panel-tls-test` runs the local panel/API and self-signed HTTPS VM integration tests. The HTTPS test uses a temporary runtime key and validates the secure cookie; it does not test ACME or HTTP-to-HTTPS redirects. `nix flake check` runs API unit tests, panel lint and builds. These tests do not prove ACME, Internet deployment, browser portability or WordPress functionality.
