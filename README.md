# WebhotelOS

WebhotelOS aims to provide a self-hosted NixOS VM for one WordPress site and one administrator. The intended first release is `0.1.0-alpha`. This repository is an early development foundation, not an MVP or a release. It contains experimental panel, API and WordPress components, but no integrated deployment, WordPress initialization, backup or restore, or tested installation procedure. Do not deploy it.

Nixpkgs is locked to NixOS 26.05 in `flake.lock`. Its revision is the source of truth for dependency versions. `system.stateVersion` is `26.05`; do not change it merely because the Nixpkgs input changes.

On an x86_64 Linux host with Nix flakes enabled, the current checks are:

```sh
nix develop
nix fmt
python3 -m unittest discover -s tests -v
nix flake check   # includes nixfmt, statix and deadnix checks
nix build .#panel .#api
nix build .#qcow2
```

The image target is experimental. It uses a BIOS/legacy-boot QCOW2 disk and the NixOS disk-image module. Its example administrator has no SSH key or password, so it is inaccessible by design. It is not an installation image. A separately configured PHP instance image was booted from disk and exercised over SSH, SFTP and HTTP; see the quickstart. `nix flake check` runs the Nix style, API and archive tests; it is not a complete VM integration test. The separate WordPress boundary test runs with `nix build .#wordpress-boundary-test` and may use slow TCG emulation without KVM.

The archive validation code is a building block only. It does not extract archives, enforce resource limits, validate a manifest, back up data or restore a site. A future restore must implement and test all of these operations, including consistency and safe extraction into a private directory.

Project code is MIT licensed; see [LICENSE](LICENSE). NixOS, Linux, WordPress and other dependencies retain their own licenses. No claim is made that a complete image is MIT licensed. Nixpkgs supplies package source and license metadata; binary distribution needs a separate license and corresponding-source review before release.

Nix tools come from the locked Nixpkgs revision. `nix fmt` formats the tree with `nixfmt-tree`; `nix flake check` checks formatting, common Nix anti-patterns with Statix, and unused bindings with deadnix. In `nix develop`, run `statix check .` or `deadnix --fail .` for individual diagnostics.

The panel has separately built production and synthetic demo adapters; see [Sites development](docs/sites.md). An opt-in local panel module connects the frontend and API to the PHP site; see [panel quickstart](docs/panel-quickstart.md). WordPress is not connected to the panel or the PHP image; see [WordPress service](docs/wordpress-service.md). Do not use these experimental components for production.

The first PHP-site milestone is documented in [the QEMU quickstart](docs/php-quickstart.md). It remains a local HTTP-only experiment; do not use it as a public hosting deployment.
