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
      example = nixpkgs.lib.nixosSystem {
        inherit system;
        modules = [ ./examples/image.nix ];
      };
    in
    {
      nixosModules.default = import ./modules/base.nix;
      nixosConfigurations.example = example;
      packages.${system}.qcow2 = example.config.system.build.image;
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
          python3
          qemu
        ];
      };
    };
}
