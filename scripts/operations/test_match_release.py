import importlib.util
import io
import json
from pathlib import Path
import sys
import tarfile
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("match_release_ops", Path(__file__).with_name("match-release.py"))
ops = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ops)


class ReleaseSafetyTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()

    def release(self, digit):
        path = self.root / "releases" / (digit * 16 + "-" + ops.requirements_digest()[:16])
        (path / "venv/bin").mkdir(parents=True)
        (path / "venv/bin/python").symlink_to(sys.executable)
        (path / "model").write_bytes(digit.encode())
        (path / "ready.json").write_text(json.dumps({"archiveSha256": digit * 64, "requirementsSha256": ops.requirements_digest(), "files": {"model": ops.digest(path / "model")}}))
        return path

    def test_switch_and_rollback_preserve_state_and_reject_corrupt_release(self):
        first, second = self.release("a"), self.release("b")
        (self.root / "vectors").write_bytes(b"persistent state")
        ops.switch(self.root, first.name)
        ops.switch(self.root, second.name)
        self.assertEqual((self.root / "previous").resolve(), first)
        ops.switch(self.root, "previous")
        self.assertEqual((self.root / "current").resolve(), first)
        self.assertEqual((self.root / "previous").resolve(), second)
        (second / "model").write_bytes(b"corrupt")
        with self.assertRaises(ValueError):
            ops.switch(self.root, second.name)
        self.assertEqual((self.root / "current").resolve(), first)
        self.assertEqual((self.root / "vectors").read_bytes(), b"persistent state")

    def test_bad_archive_checksum_does_not_touch_current(self):
        first = self.release("a")
        ops.switch(self.root, first.name)
        archive = self.root / "bad.tar.gz"
        archive.write_bytes(b"bad")
        with self.assertRaises(ValueError):
            ops.prepare(self.root, archive, "0" * 64, "3.12")
        self.assertEqual((self.root / "current").resolve(), first)

    def test_correctly_hashed_archive_still_rejects_traversal_and_symlinks(self):
        for name, kind in (("../../outside", tarfile.REGTYPE), ("cpu/model", tarfile.SYMTYPE)):
            with self.subTest(name=name):
                archive = self.root / "unsafe.tar"
                with tarfile.open(archive, "w") as tar:
                    entry = tarfile.TarInfo(name)
                    entry.type = kind
                    if kind == tarfile.REGTYPE:
                        entry.size = 1
                        tar.addfile(entry, io.BytesIO(b"x"))
                    else:
                        entry.linkname = "/etc/passwd"
                        tar.addfile(entry)
                with self.assertRaises(ValueError):
                    ops.prepare(self.root, archive, ops.digest(archive), "3.12")
                self.assertEqual(list((self.root / "releases").iterdir()), [])

    def test_current_cannot_escape_release_directory(self):
        (self.root / "current").symlink_to(self.root.parent)
        with self.assertRaises(ValueError):
            ops.verify(self.root, "current")


if __name__ == "__main__":
    unittest.main()
