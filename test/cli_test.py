"""Mac-side CLI routing, with app execution mocked (no app/socket required)."""
import contextlib
import io
import json
from pathlib import Path
import runpy
import sys
import subprocess
import unittest
from unittest.mock import patch

CLI = str(Path(__file__).resolve().parents[1] / "mods/herdr-md/mdh")


class OpenTests(unittest.TestCase):
    def invoke(self, *args, exists=False):
        with patch.object(sys, "argv", ["mdh", *args]), patch("os.path.isfile", return_value=exists), patch("subprocess.run", return_value=subprocess.CompletedProcess([], 0, stdout="", stderr="")) as call:
            with contextlib.redirect_stdout(io.StringIO()):
                try:
                    runpy.run_path(CLI, run_name="__main__")
                except SystemExit as error:
                    if error.code != 0:
                        raise
            return call

    def test_remote_open_does_not_require_mac_file(self):
        call = self.invoke("open", "/docs/sub/../README.md", "--on", "devbox", "--pane", "devbox/pane-id")
        cmd = call.call_args.args[0]
        self.assertEqual(cmd[:3], ["herdr-app", "do", "pane.split"])
        self.assertEqual(json.loads(cmd[3]), {"direction": "right", "mod": "herdr-md", "pane": "devbox/pane-id", "props": {"file": "/docs/README.md", "on": "devbox"}})

    def test_local_open_preserved(self):
        call = self.invoke("open", "/tmp/local.md", exists=True)
        args = json.loads(call.call_args.args[0][3])
        self.assertEqual(args["props"], {"file": "/tmp/local.md"})

    def test_missing_local_file_still_fails(self):
        with self.assertRaisesRegex(SystemExit, "no such file"):
            self.invoke("open", "/missing.md")

    def test_remote_rejects_relative_path_and_empty_machine(self):
        for args in [("open", "relative.md", "--on", "devbox"), ("open", "/a.md", "--on", "")]:
            with self.subTest(args=args), self.assertRaisesRegex(SystemExit, "absolute POSIX path"):
                self.invoke(*args)


if __name__ == "__main__":
    unittest.main()
