"""CPU 서비스용 E5와 두 채점 헤드를 동적 길이 ONNX로 내보낸다."""

import argparse
import os
from pathlib import Path
import shutil
import tempfile

import torch
from torch import nn

from runtime import EvidenceHead, fusion_head, pilot
from match_onnx import export_encoder, OPSET


class Heads(nn.Module):
    def __init__(self, weights):
        super().__init__()
        self.pilot = pilot._create_mlp(3072, weights["pilotHidden"], 42)
        self.pilot.load_state_dict(weights["pilot"])
        self.evidence = EvidenceHead()
        self.evidence.load_state_dict(weights["evidence"])
        self.fusion = fusion_head()
        self.fusion.load_state_dict(weights["fusion"])
        self.use_learned = weights["settings"]["evidenceMethod"] == "learned"
        self.use_fusion = weights["settings"]["screenMethod"] == "fusion"

    def forward(self, profile, job, records, requirements, kinds):
        cos = requirements @ records.transpose(0, 1)
        logits = (
            self.evidence(requirements[:, None, :], records[None, :, :])
            if self.use_learned
            else (cos - 0.80) * 30
        )
        best = logits.amax(1).sigmoid()
        best_cos = cos.amax(1)
        base = (
            self.pilot(torch.cat([profile, job, (profile - job).abs(), profile * job])).reshape(()).sigmoid()
        )
        means = []
        for kind in (0, 1, 2):
            mask = (kinds == kind).float()
            means.append(
                torch.where(mask.sum() > 0, (best * mask).sum() / mask.sum().clamp(min=1), best.mean())
            )
        count = torch.ones_like(records[:, 0]).sum().log1p() / 5
        feat = torch.stack(
            [
                base,
                (profile * job).sum(),
                best.mean(),
                best.min(),
                *means,
                best_cos.mean(),
                best_cos.min(),
                count,
            ]
        )
        score = self.fusion(feat).reshape(()).sigmoid() if self.use_fusion else base
        return score * 100, base * 100, logits


def export(bundle, output):
    if output.exists():
        raise FileExistsError(output)
    weights = torch.load(bundle / "model.pt", map_location="cpu", weights_only=True)
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=output.parent) as tmp:
        dest = Path(tmp) / "onnx"
        dest.mkdir()
        export_encoder(str(bundle / "encoder"), dest / "encoder", quantize=False)
        for f in (bundle / "encoder").glob("*.json"):
            shutil.copyfile(f, dest / "encoder" / f.name)
        heads = Heads(weights).eval()
        inputs = (
            torch.randn(768),
            torch.randn(768),
            torch.randn(3, 768),
            torch.randn(2, 768),
            torch.tensor([0, 2]),
        )
        torch.onnx.export(
            heads,
            inputs,
            str(dest / "heads.onnx"),
            dynamo=False,
            opset_version=OPSET,
            input_names=["profile", "job", "records", "requirements", "kinds"],
            output_names=["score", "pilot", "evidence_logits"],
            dynamic_axes={
                "records": {0: "record_count"},
                "requirements": {0: "requirement_count"},
                "kinds": {0: "requirement_count"},
                "evidence_logits": {0: "requirement_count", 1: "record_count"},
            },
        )
        pilot._atomic_json(
            dest / "manifest.json",
            {
                "format": "expresso-match-cpu-v1",
                "settings": weights["settings"],
                "sourceWeightsSha256": pilot._sha256(bundle / "model.pt"),
                "files": {str(p.relative_to(dest)): pilot._sha256(p) for p in dest.rglob("*") if p.is_file()},
            },
        )
        os.rename(dest, output)
    print("ONNX export complete", flush=True)


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--bundle", type=Path, required=True)
    p.add_argument("--output", type=Path, required=True)
    export(**vars(p.parse_args()))
