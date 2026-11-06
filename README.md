# WebhotelOS

WebhotelOS aims to provide a self-hosted NixOS VM for one WordPress site and one administrator. The intended first release is `0.1.0-alpha`. This repository is an early development foundation, not an MVP or a release. It does not yet provide WordPress, a management panel, an API, backup or restore, an installation procedure, or a tested bootable image. Do not deploy it.

Nixpkgs is locked to NixOS 26.05 in `flake.lock`. Its revision is the source of truth for dependency versions. `system.stateVersion` is `26.05`; do not change it merely because the Nixpkgs input changes.

On an x86_64 Linux host with Nix flakes enabled, the current checks are:

```sh
nix develop
nix fmt
python3 -m unittest discover -s tests -v
nix flake check
nix build .#qcow2
```

The image target is experimental. It uses a BIOS/legacy-boot QCOW2 disk and the NixOS disk-image module. Its example administrator has no SSH key or password, so it is inaccessible by design. It has not been verified by booting from disk. It is not an installation image. `nix flake check` tests archive member validation; it is not a VM integration test.

The archive validation code is a building block only. It does not extract archives, enforce resource limits, validate a manifest, back up data or restore a site. A future restore must implement and test all of these operations, including consistency and safe extraction into a private directory.

Project code is MIT licensed; see [LICENSE](LICENSE). NixOS, Linux, WordPress and other dependencies retain their own licenses. No claim is made that a complete image is MIT licensed. Nixpkgs supplies package source and license metadata; binary distribution needs a separate license and corresponding-source review before release.
