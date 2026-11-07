"""Read the state of the fixed services in the experimental PHP-site profile."""

import subprocess

# This is the stable NixOS system profile path, not an executable supplied by a request.
SYSTEMCTL = "/run/current-system/sw/bin/systemctl"
SERVICE_UNITS = {
    "nginx": "nginx.service",
    "php_fpm": "phpfpm-webhotelos-site.service",
    "mariadb": "mysql.service",
}
ACTIVE_STATES = frozenset({"active", "reloading", "inactive", "failed", "activating", "deactivating", "maintenance", "refreshing"})


def service_statuses() -> dict[str, str]:
    """Query only fixed systemd units; inaccessible or invalid results are unknown."""
    result = {}
    for name, unit in SERVICE_UNITS.items():
        try:
            output = subprocess.run(
                [SYSTEMCTL, "--system", "show", "--property=ActiveState", "--value", unit],
                stdin=subprocess.DEVNULL,
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
                text=True,
                timeout=2,
                check=False,
                env={"LC_ALL": "C"},
            )
            value = output.stdout.strip()
            result[name] = value if output.returncode == 0 and value in ACTIVE_STATES else "unknown"
        except (OSError, subprocess.SubprocessError, UnicodeError):
            result[name] = "unknown"
    return result
