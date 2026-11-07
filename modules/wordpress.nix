{ config, lib, ... }:
let
  inherit (lib)
    mkEnableOption
    mkIf
    mkOption
    types
    ;
  cfg = config.webhotelos.wordpress;
  stateDir = "/var/lib/wordpress/${cfg.hostName}";
  origin = "${if cfg.localHTTP then "http" else "https"}://${cfg.hostName}";
in
{
  options.webhotelos.wordpress = {
    enable = mkEnableOption "the experimental single-site WordPress service";
    hostName = mkOption {
      type = types.strMatching "[a-z0-9]([a-z0-9-]*[a-z0-9])?(\\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*";
      example = "site.example.test";
      description = "Lowercase DNS name for the sole WordPress site. Never place secrets here.";
    };
    localHTTP = mkOption {
      type = types.bool;
      default = false;
      description = ''
        Serve development HTTP on IPv4 loopback only. This disables ACME and is
        not suitable for a public deployment. False enables HTTPS via ACME.
      '';
    };
  };

  config = mkIf cfg.enable {
    assertions = [
      {
        assertion = builtins.attrNames config.services.wordpress.sites == [ cfg.hostName ];
        message = "WebhotelOS supports exactly one WordPress site per VM.";
      }
    ];

    services = {
      wordpress = {
        webserver = "nginx";
        sites.${cfg.hostName} = {
          database = {
            createLocally = true;
            socket = "/run/mysqld/mysqld.sock";
          };
          plugins = { };
          settings = {
            WP_HOME = origin;
            WP_SITEURL = origin;
            FORCE_SSL_ADMIN = !cfg.localHTTP;
            DISALLOW_FILE_MODS = true;
            WP_AUTO_UPDATE_CORE = false;
          };
          poolConfig = {
            pm = "dynamic";
            "pm.max_children" = 8;
            "pm.start_servers" = 2;
            "pm.min_spare_servers" = 1;
            "pm.max_spare_servers" = 3;
            "pm.max_requests" = 500;
          };
        };
      };

      # The upstream module creates the wordpress database and grants access to
      # the wordpress Unix user. No database password is placed in the Nix store.
      mysql.settings.mysqld.skip-networking = true;

      nginx.virtualHosts.${cfg.hostName} = {
        forceSSL = !cfg.localHTTP;
        enableACME = !cfg.localHTTP;
        listen = lib.mkIf cfg.localHTTP [
          {
            addr = "127.0.0.1";
            port = 80;
          }
        ];
        # A future authorized initializer must create this marker only after
        # checking WordPress itself. Until then the site fails closed.
        extraConfig = ''
          if (!-f ${stateDir}/initialized) { return 503; }
        '';
        locations = {
          "= /wp-config.php".return = "404";
          "= /wp-admin/install.php".return = "404";
          "= /wp-admin/setup-config.php".return = "404";
          # Upstream's generic PHP regexp has priority 500; this deny must
          # precede it or an uploaded PHP file can be executed.
          "~* /(?:uploads|files)/.*\\.php$".priority = lib.mkForce 100;
        };
      };
    };
    networking.firewall.allowedTCPPorts = lib.optionals (!cfg.localHTTP) [
      80
      443
    ];
  };
}
