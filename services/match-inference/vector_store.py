"""인코더 버전별 임베딩과 MongoDB 변경 스트림의 재개 위치를 저장한다."""

import hashlib
import sqlite3
from pathlib import Path

import numpy as np


def encoder_version(bundle):
    # 토크나이저·입력 길이·접두어·풀링·정규화가 달라지면 별도 공간을 사용한다.
    digest = hashlib.sha256(b"e5-mean-mask-l2-512-v1")
    for name in ("model.onnx", "tokenizer.json"):
        with (bundle / "encoder" / name).open("rb") as stream:
            digest.update(hashlib.file_digest(stream, "sha256").digest())
    return digest.hexdigest()


class VectorStore:
    def __init__(self, directory, bundle):
        if directory is None:
            path = ":memory:"
        else:
            directory = Path(directory)
            directory.mkdir(parents=True, exist_ok=True, mode=0o700)
            path = directory / (encoder_version(bundle) + ".sqlite3")
        self.db = sqlite3.connect(path, check_same_thread=False, timeout=30)
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.execute("PRAGMA synchronous=FULL")
        self.db.executescript("""
          CREATE TABLE IF NOT EXISTS vectors (key BLOB PRIMARY KEY, value BLOB NOT NULL) WITHOUT ROWID;
          CREATE TABLE IF NOT EXISTS refs (owner TEXT, key BLOB, PRIMARY KEY(owner,key)) WITHOUT ROWID;
          CREATE INDEX IF NOT EXISTS refs_by_key ON refs(key);
          CREATE TABLE IF NOT EXISTS members (member TEXT, owner TEXT, PRIMARY KEY(member,owner)) WITHOUT ROWID;
          CREATE INDEX IF NOT EXISTS members_by_owner ON members(owner);
          CREATE TABLE IF NOT EXISTS checkpoints (source TEXT PRIMARY KEY, token TEXT) WITHOUT ROWID;
        """)

    def restore(self, limit):
        # 작은 저장소는 한 번에 순차 조회한다. 큰 저장소는 공개 공고부터 제한된 수만 읽는다.
        cursor = self.db.execute("SELECT key FROM vectors LIMIT ?", (limit + 1,))
        keys = [r[0] for r in cursor]
        if len(keys) <= limit:
            return {
                k: np.frombuffer(v, dtype="<f4")
                for k, v in self.db.execute(
                    "SELECT key,value FROM vectors LIMIT ?", (limit,)
                )
            }
        public = self.db.execute(
            "SELECT key FROM refs WHERE owner GLOB 'job/*' LIMIT ?", (limit,)
        )
        selected = dict.fromkeys(k for (k,) in public)
        selected.update(dict.fromkeys(keys[:limit]))
        return self.read(list(selected)[:limit])

    def read(self, keys):
        values = {}
        for start in range(0, len(keys), 500):
            group = keys[start : start + 500]
            marks = ",".join("?" for _ in group)
            for key, blob in self.db.execute(
                f"SELECT key,value FROM vectors WHERE key IN ({marks})", group
            ):
                values[key] = np.frombuffer(blob, dtype="<f4")
        return values

    def replace(self, owner, vectors, members):
        with self.db:
            self.db.execute("BEGIN IMMEDIATE")
            previous = {
                row[0]
                for row in self.db.execute(
                    "SELECT key FROM refs WHERE owner=?", (owner,)
                )
            }
            added, removed = vectors.keys() - previous, previous - vectors.keys()
            previous_members = {
                r[0]
                for r in self.db.execute(
                    "SELECT member FROM members WHERE owner=?", (owner,)
                )
            }
            members = set(members)
            self.db.executemany(
                "INSERT INTO members VALUES (?,?)",
                ((m, owner) for m in members - previous_members),
            )
            self.db.executemany(
                "DELETE FROM members WHERE member=? AND owner=?",
                ((m, owner) for m in previous_members - members),
            )
            self.db.executemany(
                "INSERT OR IGNORE INTO vectors VALUES (?,?)",
                ((k, vectors[k].astype("<f4", copy=False).tobytes()) for k in added),
            )
            self.db.executemany(
                "INSERT INTO refs VALUES (?,?)", ((owner, k) for k in added)
            )
            self.db.executemany(
                "DELETE FROM refs WHERE owner=? AND key=?",
                ((owner, k) for k in removed),
            )
            self.db.executemany(
                "DELETE FROM vectors WHERE key=? AND NOT EXISTS (SELECT 1 FROM refs WHERE key=?)",
                ((k, k) for k in removed),
            )
        return len(added), removed

    def checkpoint(self, payload):
        source = payload["source"]
        with self.db:
            if "token" in payload:
                self.db.execute("BEGIN IMMEDIATE")
            row = self.db.execute(
                "SELECT token FROM checkpoints WHERE source=?", (source,)
            ).fetchone()
            current = row[0] if row else None
            if "token" in payload and payload.get("expected", current) == current:
                current = payload["token"]
                self.db.execute(
                    "INSERT OR REPLACE INTO checkpoints VALUES (?,?)", (source, current)
                )
        return {"token": current}

    def member_owners(self, member):
        return [
            r[0]
            for r in self.db.execute(
                "SELECT owner FROM members WHERE member=?", (member,)
            )
        ]

    def owners(self, after):
        return [
            r[0]
            for r in self.db.execute(
                "SELECT DISTINCT owner FROM refs WHERE owner>? ORDER BY owner LIMIT 256",
                (after,),
            )
        ]
