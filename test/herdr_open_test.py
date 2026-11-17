"""Pure layout + isolated fake UNIX-core tests; never contact a real Herdr core."""
import copy
import json
import os
from pathlib import Path
import runpy
import socket
import subprocess
import sys
import tempfile
import threading
import time
import types
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "scripts/herdr-open"
h = types.SimpleNamespace(**runpy.run_path(str(SCRIPT), run_name="herdr_open_tests"))
OP = "a" * 32
FILE = "/tmp/docs/README.md"


def block(node="p1", terminal="t22", weight=2):
    return {"type": "block", "id": node, "size": {"weight": weight}, "content": {"terminal": terminal}}


def document():
    return {"foreign": {"keep": True}, "spaces": [{"id": "sp1", "name": "source", "tabs": [
        {"id": "tb1", "name": "Pi", "unknown": [1, 2], "root": {"type": "row", "id": "tb1", "children": [block(), block("p2", "t9", 4)]}}
    ]}]}


def root(doc):
    return doc["spaces"][0]["tabs"][0]["root"]


class FakeCore:
    def __init__(self, mode="normal", value=None):
        self.mode = mode
        self.value = copy.deepcopy(document() if value is None else value)
        self.version = 1
        self.requests = []
        self.sets = 0
        self.accepts = 0
        self.directory = tempfile.TemporaryDirectory(prefix="ho-", dir="/tmp")
        self.path = str(Path(self.directory.name) / "core.sock")
        self.server = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.server.bind(self.path)
        self.server.listen(5)
        self.server.settimeout(.1)
        self.stopping = threading.Event()
        self.thread = threading.Thread(target=self.serve, daemon=True)
        self.thread.start()

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.stopping.set()
        self.server.close()
        self.thread.join(timeout=2)
        self.directory.cleanup()

    def send(self, conn, request, result=None, error=None):
        response = {"jsonrpc": "2.0", "id": request["id"]}
        response["error" if error else "result"] = error if error else result
        if self.mode == "wrong-id":
            response["id"] = 999
        if self.mode == "bad-envelope":
            response = [1, 2, 3]
        data = json.dumps(response, ensure_ascii=False).encode() + b"\n"
        if self.mode == "fragments":
            conn.sendall(b'{"jsonrpc":"2.0","method":"event","params":{}}\n')
            conn.sendall(data[:7])
            conn.sendall(data[7:])
        else:
            conn.sendall(data)

    def serve(self):
        while not self.stopping.is_set():
            try:
                conn, _ = self.server.accept()
            except socket.timeout:
                continue
            except OSError:
                break
            self.accepts += 1
            try:
                with conn:
                    conn.settimeout(.5)
                    stream = conn.makefile("rb")
                    while not self.stopping.is_set():
                        line = stream.readline()
                        if not line:
                            break
                        request = json.loads(line)
                        self.requests.append(request)
                        method = request["method"]
                        if method == "hello":
                            self.send(conn, request, {"generation": 1, "core": {"version": "0.1.21"}})
                        elif method == "doc.get":
                            if self.mode == "timeout":
                                time.sleep(.15)
                            if self.mode == "oversize":
                                conn.sendall(b'x' * (h.MAX_RESPONSE + 1))
                                break
                            self.send(conn, request, {"version": self.version, "value": self.value})
                        elif method == "doc.set":
                            self.sets += 1
                            if self.mode == "conflict" and self.sets == 1:
                                self.value["spaces"].append({"id": "concurrent", "tabs": [], "name": "preserve me"})
                                self.version += 1
                                self.send(conn, request, error={"code": -32000, "data": {"kind": "conflict"}, "message": "conflict"})
                                continue
                            if self.mode == "reject":
                                self.send(conn, request, error={"code": -32000, "data": {"kind": "unavailable"}, "message": "unavailable"})
                                continue
                            if request["params"]["version"] != self.version:
                                self.send(conn, request, error={"code": -32000, "data": {"kind": "conflict"}, "message": "conflict"})
                                continue
                            self.value = request["params"]["value"]
                            self.version += 1
                            if self.mode == "ambiguous" and self.sets == 1:
                                break  # Commit happened, response lost. Same op must be found.
                            self.send(conn, request, {"version": self.version})
                            if self.mode == "readback-missing":
                                self.value = document()
                                self.version += 1
                        else:
                            self.send(conn, request, error={"code": -32601, "message": "unknown"})
            except (OSError, ValueError):
                pass

    def open(self, **kwargs):
        return h.open_document(self.path, "t22", FILE, "devbox", OP, timeout=.5, **kwargs)


class LayoutTests(unittest.TestCase):
    def plan(self, value=None, **kwargs):
        return h.plan_open(document() if value is None else value, FILE, "devbox", "t22", OP, **kwargs)

    def test_right_split_preserves_sibling_and_unknown_fields(self):
        original = document()
        updated, info = self.plan(original)
        children = root(updated)["children"]
        self.assertEqual([n["id"] for n in children], ["p1", "p" + OP, "p2"])
        self.assertEqual([n["size"]["weight"] for n in children], [1, 1, 4])
        self.assertEqual(updated["foreign"], original["foreign"])
        self.assertEqual(updated["spaces"][0]["tabs"][0]["unknown"], [1, 2])
        self.assertEqual(original, document(), "pure function must not mutate original")
        self.assertFalse(info["reused"])
        self.assertEqual(children[1]["content"]["props"]["on"], "devbox")

    def test_orthogonal_split_wraps_source_preserving_exterior_size(self):
        value = document()
        root(value)["type"] = "column"
        updated, _ = self.plan(value)
        wrapper = root(updated)["children"][0]
        self.assertEqual(wrapper["type"], "row")
        self.assertEqual(wrapper["size"], {"weight": 2})
        self.assertNotIn("size", wrapper["children"][0])
        self.assertEqual(root(updated)["children"][1], block("p2", "t9", 4))

    def test_pixel_size_is_preserved_like_native_split(self):
        value = document()
        root(value)["children"][0]["size"] = {"px": 420}
        updated, _ = self.plan(value)
        self.assertEqual(root(updated)["children"][0]["size"], {"px": 420})
        self.assertEqual(root(updated)["children"][1]["size"], {"weight": .5})

    def test_single_block_root_supported(self):
        value = document()
        value["spaces"][0]["tabs"][0]["root"] = block()
        updated, _ = self.plan(value)
        self.assertEqual(root(updated)["type"], "row")
        self.assertEqual(root(updated)["size"], {"weight": 2})

    def test_new_tab_retains_existing_tree_and_focus(self):
        value = document()
        updated, result = self.plan(value, new_tab=True)
        self.assertEqual(updated["spaces"][0]["tabs"][0], value["spaces"][0]["tabs"][0])
        self.assertEqual(len(updated["spaces"][0]["tabs"]), 2)
        self.assertEqual(result["tab_id"], "tb" + OP)
        self.assertNotIn("focus", updated)

    def test_operation_id_reapplication_is_idempotent(self):
        once, _ = self.plan()
        twice, result = self.plan(once)
        self.assertEqual(once, twice)
        self.assertTrue(result["reused"])
        with self.assertRaisesRegex(h.OpenError, "different arguments"):
            h.plan_open(once, "/changed.md", "devbox", "t22", OP)

    def test_missing_duplicate_and_invalid_sources_fail(self):
        for mutate in [lambda d: root(d)["children"].pop(0), lambda d: root(d)["children"].append(block("p3")),
                       lambda d: root(d).__setitem__("type", "future-kind"), lambda d: root(d)["children"][0].__setitem__("size", {"weight": -1})]:
            value = document(); mutate(value)
            with self.subTest(value=value), self.assertRaises(h.OpenError):
                self.plan(value)

    def test_stack_split_rejected_new_tab_allowed(self):
        value = document(); root(value)["type"] = "stack"; root(value)["active"] = "p1"
        with self.assertRaisesRegex(h.OpenError, "stacked"):
            self.plan(value)
        updated, _ = self.plan(value, new_tab=True)
        self.assertEqual(root(updated), root(value))

    def test_unknown_document_duplicate_ids_and_size_cap(self):
        with self.assertRaises(h.OpenError): self.plan({})
        value = document(); root(value)["children"][1]["id"] = "p1"
        with self.assertRaisesRegex(h.OpenError, "Duplicate"): self.plan(value)
        value = document(); value["huge"] = "x" * h.MAX_DOCUMENT
        with self.assertRaisesRegex(h.OpenError, "byte limit"): self.plan(value)


class ProtocolTests(unittest.TestCase):
    def test_exact_conflict_kind_discrimination(self):
        self.assertTrue(h.RpcError({"code": -32000, "message": "conflict", "data": {"kind": "conflict"}}).conflict())
        self.assertFalse(h.RpcError({"code": -32000, "message": "unavailable", "data": {"kind": "unavailable"}}).conflict())

    def test_full_handshake_write_and_readback_with_notifications(self):
        with FakeCore("fragments") as fake:
            result = fake.open()
            self.assertEqual(result["version"], 2)
            self.assertEqual(fake.sets, 1)
            self.assertEqual([r["method"] for r in fake.requests], ["hello", "doc.get", "doc.set", "doc.get"])
            self.assertTrue(all("on" not in r["params"] for r in fake.requests), "core operations must stay local")

    def test_cas_conflict_reapplies_preserving_unrelated_concurrent_change(self):
        with FakeCore("conflict") as fake:
            result = fake.open()
            self.assertEqual(fake.sets, 2)
            self.assertEqual(fake.value["spaces"][-1]["name"], "preserve me")
            self.assertEqual(result["version"], 3)
            self.assertEqual(len(root(fake.value)["children"]), 3)

    def test_accepted_write_with_lost_response_does_not_duplicate(self):
        with FakeCore("ambiguous") as fake:
            result = fake.open()
            self.assertTrue(result["reused"])
            self.assertEqual(fake.sets, 1)
            self.assertEqual(len(root(fake.value)["children"]), 3)

    def test_non_conflict_rejection_is_not_retried(self):
        with FakeCore("reject") as fake:
            with self.assertRaises(h.RpcError): fake.open()
            self.assertEqual(fake.sets, 1)
            self.assertEqual(fake.value, document())

    def test_bad_models_cannot_write(self):
        with FakeCore(value={"unexpected": True}) as fake:
            with self.assertRaises(h.OpenError): fake.open()
            self.assertEqual(fake.sets, 0)

    def test_missing_readback_is_not_blindly_recreated(self):
        with FakeCore("readback-missing") as fake:
            with self.assertRaisesRegex(h.OpenError, "absent on readback"): fake.open()
            self.assertEqual(fake.sets, 1)

    def test_timeout_and_protocol_errors_are_bounded(self):
        for mode in ["timeout", "bad-envelope", "wrong-id", "oversize"]:
            with self.subTest(mode=mode), FakeCore(mode) as fake:
                t0 = time.monotonic()
                with self.assertRaises(h.OpenError):
                    h.open_document(fake.path, "t22", FILE, "devbox", OP, retries=0, timeout=.05)
                self.assertLess(time.monotonic() - t0, 1)
                self.assertEqual(fake.sets, 0)


class CliTests(unittest.TestCase):
    def run_cli(self, file, fake=None, extra=()):
        env = dict(os.environ, HC_TERMINAL_ID="t22", HC_TERMINAL_SOCKET=fake.path if fake else "/tmp/herdr-open-never-connect.sock")
        return subprocess.run([sys.executable, str(SCRIPT), str(file), "--on", "devbox", *extra],
                              env=env, capture_output=True, text=True, timeout=5)

    def test_cli_spaces_unicode_environment_and_newtab(self):
        with tempfile.TemporaryDirectory(prefix="ho-doc-", dir="/tmp") as folder, FakeCore() as fake:
            path = Path(folder) / "日本語 space.md"; path.write_text("# hello", encoding="utf-8")
            completed = self.run_cli(path, fake, ("--new-tab",))
            self.assertEqual(completed.returncode, 0, completed.stderr)
            result = json.loads(completed.stdout)
            self.assertEqual(result["file"], str(path.resolve()))
            self.assertTrue(result["client_pane"].startswith("devbox/"))
            self.assertEqual(len(fake.value["spaces"][0]["tabs"]), 2)

    def test_bad_files_no_core_connection(self):
        with tempfile.TemporaryDirectory(prefix="ho-doc-", dir="/tmp") as folder, FakeCore() as fake:
            pdf = Path(folder) / "a.pdf"; pdf.write_bytes(b"%PDF")
            binary = Path(folder) / "a.md"; binary.write_bytes(b"\0bad")
            for path in [pdf, binary, Path(folder) / "missing.md", Path(folder)]:
                with self.subTest(path=path):
                    completed = self.run_cli(path, fake)
                    self.assertNotEqual(completed.returncode, 0)
            self.assertEqual(fake.accepts, 0)
            self.assertEqual(fake.sets, 0)

    def test_explicit_operation_retry_and_overrides(self):
        with tempfile.TemporaryDirectory(prefix="ho-doc-", dir="/tmp") as folder, FakeCore() as fake:
            path = Path(folder) / "a.markdown"; path.write_text("# A", encoding="utf-8")
            flags = ("--operation-id", OP, "--socket", fake.path, "--terminal", "t22")
            first = self.run_cli(path, fake, flags); second = self.run_cli(path, fake, flags)
            self.assertEqual(first.returncode, 0, first.stderr)
            self.assertEqual(second.returncode, 0, second.stderr)
            self.assertTrue(json.loads(second.stdout)["reused"])
            self.assertEqual(fake.sets, 1)

    def test_missing_terminal_and_unbounded_options_fail(self):
        with tempfile.TemporaryDirectory(prefix="ho-doc-", dir="/tmp") as folder, FakeCore() as fake:
            path = Path(folder) / "a.md"; path.write_text("# A", encoding="utf-8")
            for flags in [("--terminal", ""), ("--terminal", "devbox/t22"), ("--timeout", "nan"), ("--retries", "20")]:
                with self.subTest(flags=flags): self.assertNotEqual(self.run_cli(path, fake, flags).returncode, 0)
            self.assertEqual(fake.accepts, 0)


if __name__ == "__main__":
    unittest.main()
