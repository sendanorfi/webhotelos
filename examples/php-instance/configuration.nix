{
  webhotelos.phpSite = {
    enable = true;
    hostName = "site.example.test";
    # Replace this placeholder with your own public SSH key before building.
    authorizedKeys = [ "ssh-ed25519 REPLACE_WITH_YOUR_PUBLIC_KEY" ];
    listenAddress = "0.0.0.0";
    openFirewall = true;
  };
}
