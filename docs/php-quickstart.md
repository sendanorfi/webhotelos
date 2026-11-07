# Experimental PHP site on QEMU

This milestone serves one writable PHP site. It does not yet provide HTTPS, WordPress, a management panel, backup or a production deployment. Use the HTTP profile only on a trusted local host. The QEMU forwards below bind to `127.0.0.1`, so they are not reachable from the network. Do not forward these ports publicly. PHP 8.5 is selected explicitly; this does not establish compatibility with any existing site or its plugins.

The instance source must be outside this repository. A Nix flake source is copied into the Nix store: the instance directory may contain only the two configuration files and other non-secret files. Never put private keys, passwords, site data or backups in it. An SSH public key is not a private key and may be included in the configuration.

On an x86_64 Linux host with Nix flakes, QEMU and OpenSSH installed, choose a dedicated empty directory for the instance. The commands below assume the shell starts at the WebhotelOS checkout root:

```sh
WEBHOTELOS_REPO="$(pwd -P)"
INSTANCE_DIR="/tmp/webhotelos-example-instance"
mkdir -p "$INSTANCE_DIR"
cp examples/php-instance/*.nix "$INSTANCE_DIR/"
```

Edit `configuration.nix` in that directory. Replace the placeholder with your own complete **public** SSH key, for example the contents of `~/.ssh/id_ed25519.pub`. Keep the private key outside the instance directory. The configuration selects `site.example.test`, an unprivileged `site` account, and an HTTP listener inside the guest. The local example input override uses this checkout and its locked Nixpkgs revision:

```sh
nix build "path:$INSTANCE_DIR#default" \
  --override-input webhotelos "git+file://$WEBHOTELOS_REPO" \
  --out-link /tmp/webhotelos-php-image
cp -i --reflink=auto /tmp/webhotelos-php-image/*.qcow2 /tmp/webhotelos-php-disk.qcow2
chmod u+w /tmp/webhotelos-php-disk.qcow2
```

Use a fresh disk filename; do not overwrite a disk containing data. The copied disk is writable runtime data. The original Nix store image remains untouched. Start the disk with BIOS, VirtIO, 2 GiB of RAM and two virtual CPUs:

```sh
qemu-system-x86_64 -m 2048 -smp 2 -nographic \
  -drive file=/tmp/webhotelos-php-disk.qcow2,if=virtio,format=qcow2 \
  -netdev user,id=net0,hostfwd=tcp:127.0.0.1:2222-:22,hostfwd=tcp:127.0.0.1:8080-:80 \
  -device virtio-net-pci,netdev=net0
```

QEMU uses software emulation by default. KVM-capable Linux hosts can add `-enable-kvm` if `/dev/kvm` is accessible. On first boot the guest creates its own SSH host keys. Verify the host-key fingerprint through a trusted out-of-band channel before accepting it. This example does not provide a separate console login for that verification. Leave the VM running, open another terminal, and use the private key corresponding to the configured public key:

```sh
printf '%s\n' "<?php echo 'WEBHOTELOS_PHP_OK';" > /tmp/test.php
sftp -P 2222 -i ~/.ssh/id_ed25519 site@127.0.0.1
```

At the SFTP prompt run `put /tmp/test.php public/test.php`, then `exit`. Request the site with its configured hostname:

```sh
curl --noproxy '*' --resolve site.example.test:8080:127.0.0.1 \
  http://site.example.test:8080/test.php
```

The expected response is `WEBHOTELOS_PHP_OK`. Site files persist in `/var/lib/webhotelos/site/public` on the writable disk. PHP executes as the site user; Nginx accesses files through its group. The site user has SSH shell access and is not an OS administrator. The example does not configure a separate OS administrator or a privilege escalation path. Do not upload untrusted PHP: it executes with the site user's permissions.

Run `nix build .#php-site-test` from the checkout to exercise SSH authentication, SFTP upload, PHP execution and reboot persistence in NixOS test VMs. This is a synthetic test and does not establish compatibility with existing deployments. The example image must also be built and tested separately from the development VM test.
