"""별도로 학습한 근거 헤드를 동적 요건·문단 수의 ONNX로 변환하고 검증한다."""

import argparse
import json
from pathlib import Path

import numpy as np
import onnxruntime as ort
import torch

from runtime import EvidenceHead
from fit_hard_negatives import PairHead
from inputs import pilot


def export(weights, policy, output):
    if output.exists() or output.with_suffix(".json").exists():
        raise FileExistsError(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    net = EvidenceHead()
    net.load_state_dict(
        torch.load(weights, weights_only=True, map_location="cpu")["state"]
    )
    net.eval()
    model = PairHead(net)
    torch.onnx.export(
        model,
        (torch.randn(2, 768), torch.randn(3, 768)),
        str(output),
        dynamo=False,
        opset_version=17,
        input_names=["requirements", "records"],
        output_names=["evidence_logits"],
        dynamic_axes={
            "requirements": {0: "requirements"},
            "records": {0: "records"},
            "evidence_logits": {0: "requirements", 1: "records"},
        },
    )
    session = ort.InferenceSession(str(output), providers=["CPUExecutionProvider"])
    errors = []
    torch.manual_seed(42)
    with torch.no_grad():
        for queries, records in ((1, 1), (3, 7), (8, 29)):
            q = torch.nn.functional.normalize(torch.randn(queries, 768), dim=-1)
            r = torch.nn.functional.normalize(torch.randn(records, 768), dim=-1)
            actual = session.run(
                None, {"requirements": q.numpy(), "records": r.numpy()}
            )[0]
            expected = model(q, r).numpy()
            np.testing.assert_allclose(actual, expected, atol=1e-4, rtol=1e-4)
            errors.append(float(np.max(np.abs(actual - expected))))
    manifest = json.loads(policy.read_bytes())
    manifest.update(
        {
            "onnxSha256": pilot._sha256(output),
            "weightsSha256": pilot._sha256(weights),
            "cpuEquivalenceMaxAbsoluteError": max(errors),
        }
    )
    pilot._atomic_json(output.with_suffix(".json"), manifest)
    print("근거 헤드 ONNX 일치 검증", max(errors), flush=True)


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--weights", type=Path, required=True)
    p.add_argument("--policy", type=Path, required=True)
    p.add_argument("--output", type=Path, required=True)
    export(**vars(p.parse_args()))
