{ lib, pkgs, ... }:
{
  networking.hostName = lib.mkDefault "webhotelos";
  networking.firewall.allowedTCPPorts = [ 22 ];
  services.openssh = {
    enable = true;
    settings = {
      PasswordAuthentication = false;
      KbdInteractiveAuthentication = false;
      PermitRootLogin = "no";
    };
  };
  users.users.admin = {
    isNormalUser = true;
    extraGroups = [ "wheel" ];
    # An instance must supply an SSH public key. This example is locked.
  };
  security.sudo.wheelNeedsPassword = true;
  environment.systemPackages = [ pkgs.git ];
  boot.kernelParams = [ "console=ttyS0" ];
  system.stateVersion = "26.05";
}
