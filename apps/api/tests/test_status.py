import subprocess
import unittest
from unittest.mock import patch

from webhotelos_api.status import SERVICE_UNITS, SYSTEMCTL, service_statuses


class ServiceStatusTest(unittest.TestCase):
    def test_fixed_units_and_validated_result(self):
        results = [
            subprocess.CompletedProcess([], 0, "active\n"),
            subprocess.CompletedProcess([], 0, "failed\n"),
            subprocess.CompletedProcess([], 0, "unexpected\n"),
        ]
        with patch("webhotelos_api.status.subprocess.run", side_effect=results) as run:
            self.assertEqual(service_statuses(), {"nginx": "active", "php_fpm": "failed", "mariadb": "unknown"})
        self.assertEqual(run.call_count, 3)
        for call, unit in zip(run.call_args_list, SERVICE_UNITS.values(), strict=True):
            self.assertEqual(call.args[0], [SYSTEMCTL, "--system", "show", "--property=ActiveState", "--value", unit])
            self.assertEqual(call.kwargs["timeout"], 2)
            self.assertEqual(call.kwargs["stdin"], subprocess.DEVNULL)
            self.assertFalse(call.kwargs.get("shell", False))

    def test_errors_are_unknown(self):
        failures = [FileNotFoundError(), subprocess.TimeoutExpired("systemctl", 2), subprocess.CompletedProcess([], 1, "active\n")]
        with patch("webhotelos_api.status.subprocess.run", side_effect=failures):
            self.assertEqual(set(service_statuses().values()), {"unknown"})


if __name__ == "__main__":
    unittest.main()
