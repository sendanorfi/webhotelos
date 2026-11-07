{
  description = "Local WebhotelOS PHP site instance";

  inputs.webhotelos.url = "github:sendanorfi/webhotelos";
  inputs.nixpkgs.follows = "webhotelos/nixpkgs";

  outputs =
    { nixpkgs, webhotelos, ... }:
    let
      system = nixpkgs.lib.nixosSystem {
        system = "x86_64-linux";
        modules = [
          (webhotelos.outPath + "/examples/image.nix")
          webhotelos.nixosModules.phpSite
          ./configuration.nix
        ];
      };
    in
    {
      packages.x86_64-linux.default = system.config.system.build.image;
    };
}
