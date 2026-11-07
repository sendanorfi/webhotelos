# Agent instructions

WebhotelOS targets Linux and NixOS on x86_64. The initial MVP is one WordPress site and one administrator per VM, with its own WebhotelOS panel and API. It does not provide multi-tenant isolation.

The GitHub repository is the source of truth. Sites compatibility means a portable static frontend and a documented HTTP API; neither production nor builds may depend on Sites or an OpenAI account. Submit Sites changes to this repository for review.

Keep public source, configuration examples and synthetic test data in Git. Keep instance configuration outside the repository; keep runtime data, backups, credentials and private keys out of Git and the Nix store. Never expose secrets through frontend builds, process arguments, logs or images.

The API must run unprivileged. A worker may execute only fixed operations with fixed executable paths and validated inputs. Never allow a browser to supply a shell command, executable, arbitrary path, service or Nix expression. WordPress code, themes and plugins are declarative Nix packages; mutable content and database data require a separate backup and restore procedure.

Use English in all repository material. Preserve existing work and the MIT license. Use small reviewable commits and a feature branch targeting develop; require independent review before merging. Do not bypass branch protection. Report commands actually run, results and blockers; never claim an unrun test passed.

As implementation grows, document actual component directories and working development, formatting, build and test commands here. Update this file whenever those responsibilities or commands change.

Current directories: `modules/` contains experimental NixOS modules; `examples/` contains the locked example image configuration; `apps/api/` contains the incomplete API; `apps/panel/` contains the frontend; `packages/webhotelos/` contains standalone Python building blocks; `tests/` contains unit and VM tests. Run `python3 -m unittest discover -s tests -v`, `nix fmt`, `nix flake check`, and `nix build .#qcow2` as appropriate. The image and archive validation code are not yet a working deployment or restore procedure.

Nix style: use `nix fmt`; `nix flake check` runs formatting, Statix and deadnix. Fix findings rather than disabling checks without a documented reason. The tools are available in `nix develop` and pinned by `flake.lock`.

Build the experimental frontend and API with `nix build .#panel .#api`. Run the separate WordPress VM boundary test with `nix build .#wordpress-boundary-test`; it does not test initialization or backup.

The immediate milestone is one PHP site: an administrator uploads a synthetic PHP file over key-authenticated SSH/SFTP and Nginx executes it through PHP-FPM. Test this independently of the later WordPress and management-panel milestones. Existing on-premise site compatibility is not established by this smoke test.

The experimental PHP site uses PHP 8.5, a site-specific unprivileged account, and writable data under `/var/lib/webhotelos/site`. `nix build .#php-site-test` runs the SSH/SFTP, PHP and reboot test. The instance image workflow is in `docs/php-quickstart.md`; never put private keys in its flake source directory.
