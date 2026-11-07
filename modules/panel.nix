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
  cfg = config.webhotelos.panel;
  stateFile = "/var/lib/webhotelos-api/state.sqlite";
  hostPattern = "[a-z0-9]([a-z0-9-]*[a-z0-9])?(\\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*";
  # Only origins are accepted: no credentials, paths, query strings or fragments.
  validOrigin =
    scheme: host: origin:
    let
      escapedHost = builtins.replaceStrings [ "." ] [ "\\." ] host;
      parts = builtins.match "${scheme}://${escapedHost}(:([1-9][0-9]{0,4}))?" origin;
      port = if parts == null then null else builtins.elemAt parts 1;
    in
    parts != null && (port == null || lib.toInt port <= 65535);
  admin = pkgs.writeShellApplication {
    name = "webhotelos-admin";
    runtimeInputs = [ pkgs.coreutils ];
    text = ''
      if [ "$(id -u)" -ne 0 ]; then
        echo 'Run this command as root, for example with sudo.' >&2
        exit 1
      fi
      exec ${pkgs.util-linux}/bin/runuser -u webhotelos-api -- \
        ${pkgs.coreutils}/bin/env WEBHOTELOS_STATE_FILE=${stateFile} \
        ${cfg.apiPackage}/bin/webhotelos-admin-internal "$@"
    '';
  };
in
{
  options.webhotelos.panel = {
    enable = mkEnableOption "the experimental local WebhotelOS management panel";
    hostName = mkOption {
      type = types.strMatching hostPattern;
      description = "Panel hostname; use localhost or 127.0.0.1 for local HTTP.";
      example = "panel.example.test";
    };
    panelOrigin = mkOption {
      type = types.str;
      description = "Exact browser origin, including any forwarded host port, without a trailing slash.";
      example = "https://panel.example.test";
    };
    siteHostName = mkOption {
      type = types.strMatching hostPattern;
      description = "The separate site hostname.";
      example = "site.example.test";
    };
    siteUrl = mkOption {
      type = types.str;
      description = "Exact site origin, including any forwarded port, without a trailing slash.";
      example = "https://site.example.test";
    };
    localHTTP = mkOption {
      type = types.bool;
      default = false;
      description = ''
        Serve HTTP on guest loopback port 8080 for development. Access it over
        an SSH tunnel, not a public port. Production enables HTTPS and ACME.
      '';
    };
    adminAuthorizedKeys = mkOption {
      type = types.listOf types.str;
      default = [ ];
      description = ''
        Public SSH keys for the panel administrator. The account may use
        passwordless sudo only for the fixed webhotelos-admin command and must
        not be in wheel. Never place private keys here.
      '';
    };
    panelPackage = mkOption {
      type = types.package;
      description = "Production static panel package.";
    };
    apiPackage = mkOption {
      type = types.package;
      description = "Package containing webhotelos-api and webhotelos-admin-internal.";
    };
  };

  config = mkIf cfg.enable {
    assertions = [
      {
        assertion = !(builtins.elem "wheel" config.users.users.admin.extraGroups);
        message = "The panel administrator must not have general wheel sudo access.";
      }
      {
        assertion = cfg.hostName != cfg.siteHostName;
        message = "The panel and site must have distinct hostnames.";
      }
      {
        assertion =
          if cfg.localHTTP then
            builtins.elem cfg.hostName [
              "localhost"
              "127.0.0.1"
            ]
            && validOrigin "http" cfg.hostName cfg.panelOrigin
          else
            validOrigin "https" cfg.hostName cfg.panelOrigin;
        message = "The panel origin must match its hostname and use HTTPS, or loopback HTTP in local mode.";
      }
      {
        assertion =
          validOrigin "https" cfg.siteHostName cfg.siteUrl
          || (cfg.localHTTP && validOrigin "http" cfg.siteHostName cfg.siteUrl);
        message = "The site URL must be an origin matching siteHostName and use HTTPS outside local mode.";
      }
    ];

    users = {
      groups.webhotelos-api = { };
      users.admin = {
        isNormalUser = lib.mkDefault true;
        openssh.authorizedKeys.keys = cfg.adminAuthorizedKeys;
      };
      users.webhotelos-api = {
        isSystemUser = true;
        group = "webhotelos-api";
        home = "/var/lib/webhotelos-api";
      };
    };
    security.sudo.extraRules = [
      {
        users = [ "admin" ];
        commands = [
          {
            command = "/run/current-system/sw/bin/webhotelos-admin";
            options = [ "NOPASSWD" ];
          }
        ];
      }
    ];
    environment.systemPackages = [ admin ];
    systemd.services.webhotelos-api = {
      description = "WebhotelOS local management API";
      wantedBy = [ "multi-user.target" ];
      after = [ "network.target" ];
      environment = {
        WEBHOTELOS_STATE_FILE = stateFile;
        WEBHOTELOS_PANEL_ORIGIN = cfg.panelOrigin;
        WEBHOTELOS_SITE_URL = cfg.siteUrl;
      }
      // lib.optionalAttrs cfg.localHTTP { WEBHOTELOS_INSECURE_LOCAL_HTTP = "1"; };
      serviceConfig = {
        Type = "simple";
        User = "webhotelos-api";
        Group = "webhotelos-api";
        StateDirectory = "webhotelos-api";
        StateDirectoryMode = "0700";
        UMask = "0077";
        ExecStart = "${cfg.apiPackage}/bin/webhotelos-api";
        Restart = "on-failure";
        NoNewPrivileges = true;
        PrivateTmp = true;
        PrivateDevices = true;
        ProtectSystem = "strict";
        ProtectHome = true;
        ProtectKernelTunables = true;
        ProtectKernelModules = true;
        ProtectControlGroups = true;
        RestrictSUIDSGID = true;
        LockPersonality = true;
        RestrictAddressFamilies = [
          "AF_UNIX"
          "AF_INET"
          "AF_INET6"
        ];
      };
    };
    services.nginx = {
      enable = true;
      appendHttpConfig = ''
        limit_req_zone $binary_remote_addr zone=webhotelos_panel:1m rate=5r/s;
      '';
      virtualHosts.${cfg.hostName} = {
        root = cfg.panelPackage;
        forceSSL = !cfg.localHTTP;
        enableACME = !cfg.localHTTP;
        listen = lib.mkIf cfg.localHTTP [
          {
            addr = "127.0.0.1";
            port = 8080;
          }
        ];
        extraConfig = ''
          client_max_body_size 16k;
          add_header X-Content-Type-Options nosniff always;
          add_header X-Frame-Options DENY always;
          add_header Referrer-Policy no-referrer always;
        '';
        locations."/api/v1/" = {
          proxyPass = "http://127.0.0.1:8765";
          extraConfig = ''
            limit_req zone=webhotelos_panel burst=10 nodelay;
            limit_req_status 429;
            proxy_set_header X-Forwarded-For "";
            proxy_set_header X-Forwarded-Proto "";
            proxy_set_header X-Real-IP "";
          '';
        };
      };
    };
    networking.firewall.allowedTCPPorts = lib.optionals (!cfg.localHTTP) [
      80
      443
    ];
  };
}
