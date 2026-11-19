"""모델 입력, 근거 선택, 재정렬 폴백 및 ONNX 채점 일치의 회귀 시험."""

from pathlib import Path
import tempfile
import unittest

import numpy as np
import onnxruntime as ort
import torch

from inputs import detail, profile_text, rerank_or_local, usable_records, validate_job
from fixed_data import fixed_requirements
from label_fixed import issues, weighted_score
from runtime import EvidenceHead, FEATURES, fusion_features, fusion_head, pilot, rank_scores
from export_cpu import Heads
from record_search import candidates


class ReleaseTest(unittest.TestCase):
    def test_missing_year_and_empty_records(self):
        records = [{"recordId": "r", "title": "기록", "bodyMd": "내용"}]
        self.assertNotIn("경력 연차", profile_text({"records": records}))
        self.assertIn("0년", profile_text({"records": records, "experienceYears": 0}))
        self.assertEqual(usable_records({"records": [{"recordId": "r", "title": " "}]}), [])
        with self.assertRaises(ValueError):
            usable_records({"records": records + records})

    def test_fixed_criteria_and_empty_evidence(self):
        req = fixed_requirements(
            "## 자격요건\n- Python 코드 운영 경험\n- 분산 시스템 설계 경험\n## 채용절차\n- 접수 및 면접 안내입니다"
        )
        self.assertEqual(len(req), 2)
        job = {"jobId": "j", "fields": {"title": "개발자", "description": "원문"}, "requirementsFixed": req}
        validate_job(job)
        with self.assertRaises(ValueError):
            validate_job({**job, "requirementsFixed": req + req})
        self.assertTrue(issues({"jobs": [[["n", 0], ["s", 1]]]}, [job], 1))
        self.assertFalse(issues({"jobs": [[["n"], ["a", 0]]]}, [job], 1))
        self.assertEqual(weighted_score([{"kind": "must", "coverage": "adequate"}]), 75)
        records = [{"recordId": "b"}, {"recordId": "a"}]
        r = detail(req[0], [0.0, 0.0], records, 3, 1.0)
        self.assertEqual((r["hasEvidence"], r["evidenceRecordIds"]), (False, []))
        self.assertEqual([i["recordId"] for i in r["records"]], ["a", "b"])

    def test_round_robin_and_local_fallback(self):
        a = {"r1": 3, "r2": 2, "r3": 1}
        b = {"r1": 1, "r2": 2, "r3": 3}
        self.assertEqual(candidates(a, b, a, 2), ["r1", "r3"])
        p = {"records": [{"recordId": "r", "title": "t", "bodyMd": "b"}]}
        j = {
            "jobId": "j",
            "fields": {"title": "역할"},
            "requirementsFixed": [{"id": "q", "kind": "must", "criterion": "자격"}],
        }
        local = {
            "status": "ok",
            "jobs": [{"jobId": "j", "localScore": 32, "evidence": [{"records": [{"recordId": "r"}]}]}],
        }
        from match_api_scorer import PROVIDERS

        class Unavailable:
            provider = PROVIDERS["decisions"]

            def call(self, body):
                raise OSError("HTTP 429")

        response = rerank_or_local(p, [j], local, Unavailable())
        self.assertEqual(response["jobs"], local["jobs"])
        self.assertEqual(response["rerankStatus"], "unavailable")
        self.assertNotIn("decisionScore", response["jobs"][0])

    def test_dynamic_onnx_heads_match_reference(self):
        torch.manual_seed(7)
        base = pilot._create_mlp(3072, 8, 42)
        ev = EvidenceHead()
        fusion = fusion_head()
        weights = {
            "pilot": base.state_dict(),
            "pilotHidden": 8,
            "evidence": ev.state_dict(),
            "fusion": fusion.state_dict(),
            "settings": {"evidenceMethod": "learned", "screenMethod": "fusion", "features": FEATURES},
        }
        heads = Heads(weights).eval()

        def vector(n):
            return torch.nn.functional.normalize(torch.rand(n, 768), dim=1)

        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "test.onnx"

            def tensors(n, m):
                return vector(1)[0], vector(1)[0], vector(n), vector(m), torch.arange(m) % 3

            names = ["profile", "job", "records", "requirements", "kinds"]
            torch.onnx.export(
                heads,
                tensors(3, 2),
                str(path),
                dynamo=False,
                opset_version=17,
                input_names=names,
                dynamic_axes={"records": {0: "r"}, "requirements": {0: "q"}, "kinds": {0: "q"}},
            )
            session = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
            for n, m in [(1, 1), (11, 5)]:
                p, j, r, q, k = tensors(n, m)
                inp = dict(zip(names, (p, j, r, q, k)))
                with torch.no_grad():
                    b = 100 * base(pilot.pair_features(p[None], j[None])).sigmoid().item()
                    z = rank_scores(ev, "learned", q, r)
                    x = fusion_features(
                        b,
                        float(p @ j),
                        z,
                        q @ r.T,
                        [("must", "responsibility", "preferred")[i] for i in k],
                        n,
                    )
                    expected = 100 * fusion(x).sigmoid().item()
                a, b2, z2 = session.run(None, {key: v.numpy() for key, v in inp.items()})
                self.assertAlmostEqual(float(a), expected, places=3)
                self.assertAlmostEqual(float(b2), b, places=3)
                np.testing.assert_allclose(z2, z.numpy(), atol=1e-4)


if __name__ == "__main__":
    unittest.main()
