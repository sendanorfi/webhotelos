{
  description = "WebhotelOS development foundation (not an MVP release)";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-26.05";

  outputs =
    { nixpkgs, ... }:
    let
      system = "x86_64-linux";
      pkgs = nixpkgs.legacyPackages.${system};
      example = nixpkgs.lib.nixosSystem {
        inherit system;
        modules = [ ./examples/image.nix ];
      };
    in
    {
      nixosModules.default = import ./modules/base.nix;
      nixosConfigurations.example = example;
      packages.${system}.qcow2 = example.config.system.build.image;
      checks.${system}.archive =
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
      formatter.${system} = pkgs.writeShellApplication {
        name = "webhotelos-fmt";
        runtimeInputs = [
          pkgs.nixfmt
          pkgs.findutils
        ];
        text = ''
          nixfmt flake.nix
          find modules examples -type f -name '*.nix' -print0 | xargs -0 -r nixfmt
        '';
      };
      devShells.${system}.default = pkgs.mkShell {
        packages = with pkgs; [
          nixfmt
          nodejs
          python3
          qemu
        ];
      };
    };
}
