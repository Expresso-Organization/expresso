import hashlib
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

import numpy as np

from server import Application, CpuRanker


class VectorPersistenceTest(unittest.TestCase):
    def setUp(self):
        temp = TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        encoder = self.root / "encoder"
        encoder.mkdir()
        for name in ("model.onnx", "tokenizer.json"):
            (encoder / name).write_bytes(b"revision-1")
        with_init = patch.object(CpuRanker, "__init__", return_value=None)
        with_init.start()
        self.addCleanup(with_init.stop)

        def encode(engine, texts, prefix):
            return {
                t: np.frombuffer(
                    hashlib.sha256((prefix + t).encode()).digest(), dtype=np.uint8
                ).astype(np.float32)
                for t in texts
            }

        with_embed = patch.object(CpuRanker, "embed", encode)
        with_embed.start()
        self.addCleanup(with_embed.stop)

    def start(self):
        app = Application(self.root, 1, None, None, self.root / "state")
        self.addCleanup(app.engine.store.db.close)
        return app

    def test_changed_record_and_aggregate_only_and_restart(self):
        app = self.start()
        profile = {
            "profileId": "a",
            "records": [
                {"recordId": "r1", "title": "기록 1", "bodyMd": "첫 본문"},
                {"recordId": "r2", "title": "기록 2", "bodyMd": "둘째 본문"},
            ],
        }

        def warm(instance):
            return instance.process("/v1/warm-profile", {"profile": profile})

        self.assertEqual(warm(app)["encoded"], 3)
        profile["records"][0]["title"] = "수정"
        self.assertEqual(warm(app), {"encoded": 2, "added": 2, "removed": 2})
        self.assertEqual(warm(app), {"encoded": 0, "added": 0, "removed": 0})
        app.engine.store.checkpoint({"source": "trial", "token": "position"})
        fresh = self.start()
        self.assertEqual(warm(fresh)["encoded"], 0)
        self.assertEqual(fresh.engine.startup_loaded, 3)
        self.assertEqual(fresh.engine.disk_hits, 0)
        self.assertEqual(
            fresh.engine.store.checkpoint({"source": "trial"})["token"], "position"
        )
        self.assertEqual(fresh.engine.store.member_owners("record/r1"), ["user/a"])
        profile["records"].pop(0)
        self.assertEqual(warm(fresh), {"encoded": 1, "added": 1, "removed": 2})
        self.assertEqual(fresh.engine.store.member_owners("record/r1"), [])
        profile["profileId"] = "b"
        self.assertEqual(warm(fresh)["encoded"], 2)
        profile["records"] = []
        self.assertEqual(warm(fresh)["removed"], 2)
        (self.root / "encoder" / "tokenizer.json").write_bytes(b"revision-2")
        next_version = self.start()
        self.assertIsNone(
            next_version.engine.store.checkpoint({"source": "trial"})["token"]
        )
        self.assertEqual(next_version.engine.store.owners(""), [])

    def test_shared_passages_and_atomic_snapshot(self):
        app = self.start()

        def save(owner, texts):
            return app.prepare(owner, texts, "passage: ", ["requirement/" + owner])

        self.assertEqual(save("job/a", ["공통", "가"])["encoded"], 2)
        self.assertEqual(save("job/b", ["공통", "나"])["encoded"], 1)
        first = app.engine.store.db.execute("select count(*) from vectors").fetchone()[
            0
        ]
        self.assertEqual(first, 3)
        with patch.object(
            CpuRanker, "embed", side_effect=RuntimeError("encoder failed")
        ):
            with self.assertRaises(RuntimeError):
                save("job/a", ["변경"])
        self.assertEqual(
            save("job/a", ["공통", "가"]), {"encoded": 0, "added": 0, "removed": 0}
        )
        app.process("/v1/forget", {"owner": "job/a"})
        fresh = self.start()
        self.assertEqual(save("job/b", ["공통", "나"])["encoded"], 0)
        self.assertEqual(
            fresh.engine.store.db.execute("select count(*) from vectors").fetchone()[0],
            2,
        )
        self.assertEqual(fresh.engine.store.owners(""), ["job/b"])
        self.assertEqual(
            fresh.prepare("job/b", ["공통", "나"], "passage: ")["encoded"], 0
        )


if __name__ == "__main__":
    unittest.main()
