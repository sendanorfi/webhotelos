{
  description = "WebhotelOS development foundation (not an MVP release)";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-26.05";

  outputs =
    { nixpkgs, ... }:
    let
      system = "x86_64-linux";
      pkgs = nixpkgs.legacyPackages.${system};
      nixSources = nixpkgs.lib.fileset.toSource {
        root = ./.;
        fileset = nixpkgs.lib.fileset.fileFilter (file: file.hasExt "nix") ./.;
      };
      apiPython = pkgs.python3.withPackages (p: [
        p.fastapi
        p.argon2-cffi
        p.httpx
        p.uvicorn
      ]);
      apiSource = nixpkgs.lib.fileset.toSource {
        root = ./apps/api;
        fileset = nixpkgs.lib.fileset.unions [
          ./apps/api/webhotelos_api
          ./apps/api/tests
        ];
      };
      apiService = pkgs.writeShellApplication {
        name = "webhotelos-api";
        runtimeInputs = [ apiPython ];
        text = ''
          export PYTHONPATH=${apiSource}
          exec python -m uvicorn webhotelos_api.app:create_app --factory --host 127.0.0.1 --port 8765 --no-access-log
        '';
      };
      apiAdmin = pkgs.writeShellApplication {
        name = "webhotelos-admin-internal";
        runtimeInputs = [ apiPython ];
        text = ''
          export PYTHONPATH=${apiSource}
          exec python -m webhotelos_api.admin "$@"
        '';
      };
      api = pkgs.symlinkJoin {
        name = "webhotelos-api";
        paths = [
          apiService
          apiAdmin
        ];
      };
      panelSource = nixpkgs.lib.fileset.toSource {
        root = ./apps/panel;
        fileset = nixpkgs.lib.fileset.unions [
          ./apps/panel/src
          ./apps/panel/tools
          ./apps/panel/.prettierignore
          ./apps/panel/.prettierrc.json
          ./apps/panel/eslint.config.mjs
          ./apps/panel/index.html
          ./apps/panel/package.json
          ./apps/panel/package-lock.json
          ./apps/panel/tsconfig.json
          ./apps/panel/vite.config.ts
        ];
      };
      panel = pkgs.buildNpmPackage {
        pname = "webhotelos-panel";
        version = "0.1.0-alpha";
        src = panelSource;
        npmDepsHash = "sha256-9HjExnpzrtMZnASpoVItC1LZUsMRLs/BqVtCgUW39MA=";
        preBuild = ''
          npm run lint
          npm run format:check
          npm run test:lint
          npm run build:demo
        '';
        installPhase = ''
          mkdir -p "$out"
          cp -r dist/. "$out/"
        '';
      };
      example = nixpkgs.lib.nixosSystem {
        inherit system;
        modules = [ ./examples/image.nix ];
      };
    in
    {
      nixosModules = {
        default = import ./modules/base.nix;
        phpSite = import ./modules/php-site.nix;
        panel = import ./modules/panel.nix;
      };
      nixosConfigurations.example = example;
      packages.${system} = {
        qcow2 = example.config.system.build.image;
        inherit api panel;
        wordpress-boundary-test = import ./tests/wordpress.nix { inherit pkgs; };
        php-site-test = import ./tests/php-site.nix { inherit pkgs; };
        panel-browser-test = import ./tests/panel-browser.nix {
          inherit pkgs;
          panelPackage = panel;
          apiPackage = api;
        };
        panel-tls-test = import ./tests/panel-tls.nix {
          inherit pkgs;
          panelPackage = panel;
          apiPackage = api;
        };
        panel-integration-test = import ./tests/panel-integration.nix {
          inherit pkgs;
          panelPackage = panel;
          apiPackage = api;
        };
      };
      checks.${system} = {
        archive =
          pkgs.runCommand "webhotelos-archive-tests"
            {
              nativeBuildInputs = [ pkgs.python3 ];
            }
            ''
              cp -r ${./packages} packages
              cp -r ${./tests} tests
              python -m unittest discover -s tests -v
              touch "$out"
            '';
        api = pkgs.runCommand "webhotelos-api-tests" { nativeBuildInputs = [ apiPython ]; } ''
          export PYTHONPATH=${apiSource}
          python -W error::ResourceWarning -m unittest discover -s ${apiSource}/tests -v
          touch "$out"
        '';
        inherit panel;
        nix-lint =
          pkgs.runCommand "webhotelos-nix-lint"
            {
              nativeBuildInputs = with pkgs; [
                nixfmt
                statix
                deadnix
                findutils
              ];
            }
            ''
              cp -r ${nixSources}/. .
              find . -type f -name '*.nix' -print0 | xargs -0 -r nixfmt --check
              statix check .
              deadnix --fail .
              touch "$out"
            '';
      };
      formatter.${system} = pkgs.nixfmt-tree;
      devShells.${system}.default = pkgs.mkShell {
        packages = with pkgs; [
          nixfmt-tree
          statix
          deadnix
          nodejs
          apiPython
          qemu
        ];
      };
    };
}
