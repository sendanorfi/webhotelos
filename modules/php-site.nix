{
  config,
  lib,
  pkgs,
  ...
}:
let
  inherit (lib)
    mkEnableOption
    mkIf
    mkOption
    types
    ;
  cfg = config.webhotelos.phpSite;
  home = "/var/lib/webhotelos/site";
  root = "${home}/public";
in
{
  options.webhotelos.phpSite = {
    enable = mkEnableOption "the experimental single-site PHP service";
    hostName = mkOption {
      type = types.strMatching "[a-z0-9]([a-z0-9-]*[a-z0-9])?(\\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*";
      example = "site.example.test";
      description = "DNS name used by the site virtual host.";
    };
    user = mkOption {
      type = types.strMatching "[a-z_][a-z0-9_-]*";
      default = "site";
      description = "Unprivileged SSH and PHP-FPM account for this site.";
    };
    authorizedKeys = mkOption {
      type = types.listOf types.str;
      default = [ ];
      description = "SSH public keys for the site account. Private keys must never be specified here.";
    };
    listenAddress = mkOption {
      type = types.enum [
        "127.0.0.1"
        "0.0.0.0"
      ];
      default = "127.0.0.1";
      description = ''
        IPv4 address on which Nginx serves HTTP. For a guest using QEMU host
        forwarding, set this to 0.0.0.0 and bind the host forward to loopback.
        HTTP does not provide transport security for a public deployment.
      '';
    };
    openFirewall = mkOption {
      type = types.bool;
      default = false;
      description = "Allow incoming HTTP connections through the guest firewall.";
    };
  };

  config = mkIf cfg.enable {
    assertions = [
      {
        assertion =
          !(builtins.elem cfg.user [
            "root"
            "admin"
            "nginx"
            "nobody"
          ])
          && builtins.stringLength cfg.user <= 31;
        message = "The site user must be a distinct unprivileged account with at most 31 characters.";
      }
    ];

    users = {
      groups.${cfg.user} = { };
      users.${cfg.user} = {
        isNormalUser = true;
        group = cfg.user;
        inherit home;
        createHome = false;
        shell = pkgs.bashInteractive;
        openssh.authorizedKeys.keys = cfg.authorizedKeys;
      };
    };

    systemd.tmpfiles.rules = [
      "d /var/lib/webhotelos 0755 root root - -"
      "d ${home} 0750 ${cfg.user} ${config.services.nginx.group} - -"
      "d ${root} 0750 ${cfg.user} ${config.services.nginx.group} - -"
    ];

    services = {
      openssh = {
        enable = true;
        authorizedKeysInHomedir = true;
        settings = {
          PasswordAuthentication = false;
          KbdInteractiveAuthentication = false;
          PermitRootLogin = "no";
        };
      };
      phpfpm.pools.webhotelos-site = {
        phpPackage = pkgs.php85;
        inherit (cfg) user;
        group = cfg.user;
        phpOptions = ''
          expose_php = Off
        '';
        settings = {
          "listen.owner" = config.services.nginx.user;
          "listen.group" = config.services.nginx.group;
          "listen.mode" = "0660";
          "pm" = "dynamic";
          "pm.max_children" = 4;
          "pm.start_servers" = 1;
          "pm.min_spare_servers" = 1;
          "pm.max_spare_servers" = 2;
          "pm.max_requests" = 500;
        };
      };
      nginx = {
        enable = true;
        recommendedOptimisation = true;
        virtualHosts.${cfg.hostName} = {
          inherit root;
          listen = [
            {
              addr = cfg.listenAddress;
              port = 80;
            }
          ];
          locations = {
            "/".extraConfig = ''
              index index.php index.html;
              try_files $uri $uri/ =404;
            '';
            "~* \\.php$".extraConfig = ''
              try_files $uri =404;
              include ${config.services.nginx.package}/conf/fastcgi_params;
              fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
              fastcgi_pass unix:${config.services.phpfpm.pools.webhotelos-site.socket};
            '';
            "~ /\\.".return = "404";
          };
        };
      };
    };
    networking.firewall.allowedTCPPorts = [ 22 ] ++ lib.optional cfg.openFirewall 80;
  };
}
