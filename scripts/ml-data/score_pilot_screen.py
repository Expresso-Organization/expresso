"""기존 E5+MLP 체크포인트로 각 프로필과 같은 분할의 모든 공고를 채점한다."""

import argparse
from pathlib import Path

import llm_suitability_train as pilot
from match_pilot_model import FrozenE5Encoder


def score(data: Path, checkpoint: Path, encoder_path: Path, output: Path, device: str) -> None:
    import torch

    profiles = pilot._read_jsonl(data / "profiles.jsonl")
    jobs = pilot._read_jsonl(data / "jobs.jsonl")
    weights = torch.load(checkpoint, weights_only=True, map_location="cpu")
    if weights["model"] != pilot.MLP_MODEL_ID or weights["e5Model"] != pilot.E5_MODEL_ID:
        raise ValueError("파일럿 E5 MLP 체크포인트가 필요하다")
    model = pilot._create_mlp(weights["embeddingDimension"] * 4, weights["hiddenDimension"], 42)
    model.load_state_dict(weights["state"])
    encoder = FrozenE5Encoder.from_pretrained(device=device, model_name=str(encoder_path), batch_size=8)
    profile_vectors = encoder.embed_profiles([pilot.render_profile(p) for p in profiles])
    job_vectors = encoder.embed_jobs([pilot.render_job(j) for j in jobs])
    rows = []
    for profile, vector in zip(profiles, profile_vectors, strict=True):
        indices = [i for i, job in enumerate(jobs) if job["split"] == profile["split"]]
        vectors = job_vectors[indices]
        features = pilot.pair_features(vector.expand_as(vectors), vectors)
        scores = pilot.predict_mlp(model, features, device="cpu").tolist()
        for index, value in zip(indices, scores, strict=True):
            rows.append({"profileId": profile["profileId"], "jobId": jobs[index]["jobId"],
                         "split": profile["split"], "prediction": value})
    pilot._atomic_jsonl(output, rows)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("data", "checkpoint", "encoder-path", "output"):
        parser.add_argument("--" + name, type=Path, required=True)
    parser.add_argument("--device", default="cpu", choices=("cpu", "cuda", "mps"))
    score(**vars(parser.parse_args()))
