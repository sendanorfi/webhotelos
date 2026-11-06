{ modulesPath, ... }:
{
  imports = [
    (modulesPath + "/virtualisation/disk-image.nix")
    ../modules/base.nix
  ];
  image.efiSupport = false;
  image.format = "qcow2";
  virtualisation.diskSize = 20480;
  boot.initrd.availableKernelModules = [
    "virtio_pci"
    "virtio_blk"
    "virtio_net"
  ];
  services.qemuGuest.enable = true;
}
