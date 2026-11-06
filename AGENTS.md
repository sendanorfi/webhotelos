# Agent instructions

WebhotelOS targets Linux and NixOS on x86_64. The initial MVP is one WordPress site and one administrator per VM, with its own WebhotelOS panel and API. It does not provide multi-tenant isolation.

The GitHub repository is the source of truth. Sites compatibility means a portable static frontend and a documented HTTP API; neither production nor builds may depend on Sites or an OpenAI account. Submit Sites changes to this repository for review.

Keep public source, configuration examples and synthetic test data in Git. Keep instance configuration outside the repository; keep runtime data, backups, credentials and private keys out of Git and the Nix store. Never expose secrets through frontend builds, process arguments, logs or images.

The API must run unprivileged. A worker may execute only fixed operations with fixed executable paths and validated inputs. Never allow a browser to supply a shell command, executable, arbitrary path, service or Nix expression. WordPress code, themes and plugins are declarative Nix packages; mutable content and database data require a separate backup and restore procedure.

Use English in all repository material. Preserve existing work and the MIT license. Use small reviewable commits and a feature branch targeting develop; require independent review before merging. Do not bypass branch protection. Report commands actually run, results and blockers; never claim an unrun test passed.

As implementation grows, document actual component directories and working development, formatting, build and test commands here. Update this file whenever those responsibilities or commands change.

Current directories: `modules/` contains the experimental NixOS base; `examples/` contains the locked example image configuration; `packages/webhotelos/` contains standalone Python building blocks; `tests/` contains unit tests. Run `python3 -m unittest discover -s tests -v`, `nix fmt`, `nix flake check`, and `nix build .#qcow2` as appropriate. The image and archive validation code are not yet a working deployment or restore procedure.
