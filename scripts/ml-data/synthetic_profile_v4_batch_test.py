import json
import random
import tempfile
import unittest
import zipfile
from collections import Counter, defaultdict
from pathlib import Path

from synthetic_profile_v4_batch import (
    _backbone_events,
    _infer_minimum_experience_years,
    band_distribution_max_deviation,
    build_profile_specs,
    build_shards,
    build_synthetic_inputs,
    inspect_batch,
    load_normalized_atoms,
    run_shard,
    scan_aihub_atoms,
)


PROPERTY_SCHEMA = {
    "experience": {"role": "text", "organization": "text"},
    "project": {"role": "text", "technologies": "tags"},
    "education_history": {
        "institution": "text",
        "program": "text",
        "startMonth": "date",
        "endMonth": "date",
    },
    "certification_award": {"issuer": "text", "issuedMonth": "date"},
    "academic_writing": {"publication": "text", "publishedMonth": "date"},
    "activity_leadership": {"role": "text", "organization": "text"},
    "skill_tool": {"group": "text"},
}


def _atoms(per_domain=6000):
    domains = ("BM", "SM", "PS", "RND", "ICT", "ARD", "MM")
    markers = (
        "프로젝트에서 요구사항을 정리하고 결과를 기록했습니다.",
        "업무 중 자료를 분석하고 오류를 수정한 경험이 있습니다.",
        "팀원과 역할을 나누고 일정 조율을 맡았습니다.",
        "도구를 사용해 반복 작업을 정리했습니다.",
    )
    return {
        domain: [
            {
                "atomId": f"aih-71592-{domain.lower()}-{index:06d}",
                "sourceFamilyId": f"aih-family-{domain.lower()}-{index // 4:05d}",
                "occupation": domain,
                "experienceLevel": "NEW" if index % 3 else "EXPERIENCED",
                "summary": markers[index % len(markers)],
            }
            for index in range(per_domain)
        ]
        for domain in domains
    }


YP_CALIBRATION = {
    "version": "yp2021-w04-aggregate-v1",
    "education": [{"value": 2, "count": 60}, {"value": 4, "count": 40}],
    "industryOccupation": [
        {"industry": 3, "occupation": 2, "count": 50},
        {"industry": 10, "occupation": 5, "count": 30},
        {"industry": 7, "occupation": 6, "count": 20},
    ],
    "trainingCount": [{"value": 0, "count": 70}, {"value": 1, "count": 30}],
    "qualificationCount": [{"value": 0, "count": 65}, {"value": 1, "count": 35}],
    "pastJobCount": [{"value": 0, "count": 55}, {"value": 1, "count": 35}, {"value": 2, "count": 10}],
}


class SyntheticProfileV4BatchTest(unittest.TestCase):
    def test_infers_minimum_experience_from_source_fact(self):
        self.assertEqual(
            _infer_minimum_experience_years(
                {"summary": "이십 년간 회사 업무를 맡았다.", "experienceLevel": "NEW"}
            ),
            20,
        )
        self.assertEqual(
            _infer_minimum_experience_years(
                {"summary": "회사에서 팀장 역할을 맡았다.", "experienceLevel": "NEW"}
            ),
            6,
        )

    def test_work_backbone_includes_honestly_synthetic_skill_record(self):
        events = _backbone_events(
            {"domain": "ICT", "experienceYears": 2},
            YP_CALIBRATION,
            random.Random(7),
        )

        skill = next(event for event in events if event["categoryKey"] == "skill_tool")
        self.assertTrue(skill["provenance"]["surveyCalibration"])
        self.assertEqual(skill["provenance"]["narrativeEvidence"], [])
        self.assertIn("tool_usage", skill["provenance"]["syntheticFields"])

    def test_loads_only_accepted_normalized_fact_spines(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            accepted = root / "accepted"
            accepted.mkdir()
            payload = {
                "atomId": "aih-1",
                "sourceFamilyId": "family-1",
                "occupation": "ICT",
                "experienceLevel": "NEW",
                "sourceZip": "source.zip",
                "sourceEntry": "source.json",
                "result": {
                    "status": "accepted",
                    "categoryKey": "project",
                    "factSpine": "팀 프로젝트에서 데이터 정리를 맡아 마무리했다.",
                },
            }
            (accepted / "aih-1.json").write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")

            atoms = load_normalized_atoms(root)

        self.assertEqual(atoms["ICT"][0]["summary"], payload["result"]["factSpine"])
        self.assertEqual(atoms["ICT"][0]["normalizedCategoryKey"], "project")
        self.assertTrue(atoms["ICT"][0]["normalized"])

    def test_band_distribution_gate_uses_batch_ratios_not_individual_crossings(self):
        self.assertEqual(
            band_distribution_max_deviation(
                Counter({"very_short": 50, "moderately_short": 50}),
                Counter({"very_short": 48, "moderately_short": 52}),
            ),
            0.02,
        )
        self.assertEqual(
            band_distribution_max_deviation(
                Counter({"very_short": 50, "moderately_short": 50}),
                Counter({"very_short": 40, "moderately_short": 60}),
            ),
            0.1,
        )

    def test_atom_scan_keeps_factual_past_experience_but_excludes_future_intent(self):
        def payload(summary, question=""):
            return {
                "dataSet": {
                    "question": {"raw": {"text": question}},
                    "answer": {"summary": {"text": summary}},
                }
            }

        with tempfile.TemporaryDirectory() as temp_dir:
            zip_path = Path(temp_dir) / "TL_04.RND_Male_New.zip"
            with zipfile.ZipFile(zip_path, "w") as archive:
                archive.writestr(
                    "ckmk_d_rnd_m_n_100001.json",
                    json.dumps(
                        payload(
                            "학교 프로젝트에서 맡은 일을 끝까지 마무리했습니다.",
                            "직접 수행한 프로젝트 경험을 말씀해 주세요.",
                        ),
                        ensure_ascii=False,
                    ),
                )
                archive.writestr(
                    "ckmk_d_rnd_m_n_100002.json",
                    json.dumps(payload("입사한다면 앞으로 새로운 일을 배우고 싶습니다."), ensure_ascii=False),
                )
                archive.writestr(
                    "ckmk_d_rnd_m_n_100003.json",
                    json.dumps(payload("연구 업무는 누구에게나 중요하다고 생각합니다."), ensure_ascii=False),
                )
                archive.writestr(
                    "ckmk_d_rnd_m_n_100004.json",
                    json.dumps(payload("학교 행사에서 맡은 준비를 끝까지 마무리했습니다."), ensure_ascii=False),
                )
                archive.writestr(
                    "ckmk_d_rnd_m_n_100005.json",
                    json.dumps(
                        payload("그때 맡은 역할을 끝까지 해냈습니다.", "직접 수행한 경험을 말씀해 주세요."),
                        ensure_ascii=False,
                    ),
                )
                archive.writestr(
                    "ckmk_d_rnd_m_n_100007.json",
                    json.dumps(
                        payload(
                            "직접 수행한 경험을 말씀해 주세요. 보고서 초안을 작성하고 검토를 마무리했습니다.",
                            "직접 수행한 경험을 말씀해 주세요.",
                        ),
                        ensure_ascii=False,
                    ),
                )
                archive.writestr(
                    "ckmk_d_rnd_m_n_100008.json",
                    json.dumps(
                        payload(
                            "협업 중 어려움을 해결한 경험을 말씀해 보세요. 일정표를 작성하고 역할 조율을 맡았습니다.",
                            "협업 경험이 있나요.",
                        ),
                        ensure_ascii=False,
                    ),
                )
                archive.writestr(
                    "ckmk_d_rnd_m_n_100009.json",
                    json.dumps(
                        payload(
                            "부모님과 대화하며 힘든 일을 해결했습니다.",
                            "어려움을 해결한 경험을 말씀해 주세요.",
                        ),
                        ensure_ascii=False,
                    ),
                )
                archive.writestr(
                    "ckmk_d_rnd_m_n_100006.json",
                    json.dumps(
                        payload(
                            "협업을 제안하는 것이 가장 좋은 방법인 것 같습니다. 그래서 팀장 역할을 맡았습니다.",
                            "문제를 해결한 경험을 말씀해 주세요.",
                        ),
                        ensure_ascii=False,
                    ),
                )
                archive.writestr(
                    "ckmk_d_rnd_m_n_100010.json",
                    json.dumps(
                        payload(
                            "지하철에서 환승을 어려워하는 외국인을 목적지까지 안내했습니다.",
                            "다른 사람을 도운 경험을 말씀해 주세요.",
                        ),
                        ensure_ascii=False,
                    ),
                )
                archive.writestr(
                    "ckmk_d_rnd_m_n_100011.json",
                    json.dumps(
                        payload(
                            "집 창문의 외풍을 막으려고 비닐과 벨크로를 사용해 해결했습니다.",
                            "창의적으로 문제를 해결한 경험을 말씀해 주세요.",
                        ),
                        ensure_ascii=False,
                    ),
                )
                archive.writestr(
                    "ckmk_d_rnd_m_n_100012.json",
                    json.dumps(
                        payload(
                            "회사 프로그램 개발에 참여했고 시간이 지나면 안정화될 수 있습니다.",
                            "수행한 프로젝트 경험을 말씀해 주세요.",
                        ),
                        ensure_ascii=False,
                    ),
                )

            atoms = scan_aihub_atoms(temp_dir)

        self.assertEqual(
            {item["atomId"] for item in atoms["RND"]},
            {
                "aih-71592-ckmk_d_rnd_m_n_100001",
                "aih-71592-ckmk_d_rnd_m_n_100007",
            },
        )
        echoed = next(item for item in atoms["RND"] if item["atomId"].endswith("100007"))
        self.assertEqual(echoed["summary"], "보고서 초안을 작성하고 검토를 마무리했습니다.")

    def test_aihub_events_are_rewritten_instead_of_prefixed_verbatim(self):
        specs = build_profile_specs(
            profile_count=10,
            family_size=10,
            split_counts={"train": 10, "valid": 0, "test": 0},
            seed=17,
        )
        payloads = build_synthetic_inputs(specs, _atoms(), YP_CALIBRATION, PROPERTY_SCHEMA, seed=17)

        source_events = [
            event
            for payload in payloads
            for event in payload["events"]
            if event["provenance"]["narrativeEvidence"]
        ]

        self.assertTrue(source_events)
        self.assertTrue(all(event["renderMode"] == "rewrite_evidence" for event in source_events))
        self.assertTrue(all(event["skeletonLead"] == "" for event in source_events))

    def test_each_profile_uses_one_domain_atom_and_reuses_only_when_pool_is_sparse(self):
        specs = build_profile_specs(
            profile_count=10,
            family_size=10,
            split_counts={"train": 10, "valid": 0, "test": 0},
            seed=17,
        )
        for spec in specs:
            spec["domain"] = "RND"
            spec["targetRoles"] = ["ML · AI", "데이터"]
            spec["targetRecordCount"] = 20
        rnd_atoms = _atoms(3)["RND"]
        for index, atom in enumerate(rnd_atoms):
            atom["sourceFamilyId"] = f"aih-family-rnd-sparse-{index}"

        payloads = build_synthetic_inputs(
            specs,
            {"RND": rnd_atoms, "ICT": _atoms(1000)["ICT"]},
            YP_CALIBRATION,
            PROPERTY_SCHEMA,
            seed=17,
        )

        used = [
            atom
            for payload in payloads
            for event in payload["events"]
            for atom in event["provenance"]["narrativeEvidence"]
        ]
        self.assertEqual(len(used), len(payloads))
        self.assertTrue(all(sum(bool(event["provenance"]["narrativeEvidence"]) for event in payload["events"]) == 1 for payload in payloads))
        self.assertTrue(all("-rnd-" in atom for atom in used))
        self.assertGreater(len(used), len(set(used)))

    def test_builds_exact_family_safe_split_and_target_distributions(self):
        specs = build_profile_specs(profile_count=3000, family_size=10, seed=20260903)

        self.assertEqual(len(specs), 3000)
        self.assertEqual(Counter(item["split"] for item in specs), {"train": 2400, "valid": 300, "test": 300})
        self.assertEqual(len({item["profileSeed"] for item in specs}), 3000)
        families = defaultdict(set)
        for item in specs:
            families[item["profileFamily"]].add(item["split"])
        self.assertEqual(len(families), 300)
        self.assertTrue(all(len(splits) == 1 for splits in families.values()))

        record_counts = [item["targetRecordCount"] for item in specs]
        self.assertAlmostEqual(sum(record_counts) / len(record_counts), 9, delta=0.05)
        self.assertGreaterEqual(min(record_counts), 1)
        self.assertLessEqual(max(record_counts), 20)
        self.assertEqual(
            Counter(item["bodyLengthPlan"]["band"] for item in specs),
            {"very_short": 474, "moderately_short": 1022, "moderately_long": 1026, "very_long": 478},
        )

    def test_synthetic_inputs_keep_atoms_in_one_split_and_exact_property_budget(self):
        specs = build_profile_specs(profile_count=300, family_size=10, seed=7)
        payloads = build_synthetic_inputs(specs, _atoms(), YP_CALIBRATION, PROPERTY_SCHEMA, seed=7)

        self.assertEqual(len(payloads), 300)
        atom_splits = defaultdict(set)
        source_family_splits = defaultdict(set)
        property_counts = Counter()
        for payload in payloads:
            self.assertEqual(payload["targetRecordCount"], len(payload["events"]))
            self.assertEqual(payload["renderingPolicy"], "skeleton-grounded-creative-v1")
            self.assertEqual(set(payload["propertySchema"]), set(PROPERTY_SCHEMA))
            self.assertEqual(
                sum(bool(event["provenance"]["narrativeEvidence"]) for event in payload["events"]),
                1,
            )
            for event in payload["events"]:
                self.assertEqual(set(event["propertyKeys"]), set(event["propertyValues"]))
                property_counts[len(event["propertyKeys"])] += 1
                for atom_id in event["provenance"]["narrativeEvidence"]:
                    atom_splits[atom_id].add(payload["split"])
                    self.assertIn(f"-{payload['sourceDomain'].lower()}-", atom_id)
                for family_id in event["provenance"].get("sourceFamilies", []):
                    source_family_splits[family_id].add(payload["split"])
                self.assertTrue(
                    event["provenance"]["surveyCalibration"]
                    or event["provenance"]["narrativeEvidence"]
                    or event["provenance"]["syntheticFields"]
                )

        self.assertTrue(all(len(splits) == 1 for splits in atom_splits.values()))
        self.assertTrue(all(len(splits) == 1 for splits in source_family_splits.values()))
        self.assertEqual(len(atom_splits), sum(len(splits) for splits in atom_splits.values()))
        total = sum(property_counts.values())
        self.assertAlmostEqual(property_counts[0] / total, 0.65, delta=0.01)
        self.assertAlmostEqual(property_counts[1] / total, 0.30, delta=0.01)
        self.assertAlmostEqual(property_counts[2] / total, 0.05, delta=0.01)
        self.assertEqual(property_counts[3], 0)

    def test_shards_are_checkpoint_aligned_and_weighted_toward_mac(self):
        specs = build_profile_specs(profile_count=3000, family_size=10, seed=9)
        shards = build_shards(specs, shard_size=25, device_weights={"windows": 0.31, "mac": 0.69})

        self.assertEqual(len(shards), 120)
        self.assertTrue(all(len(item["profiles"]) == 25 for item in shards))
        first_300 = [item for item in shards if item["endIndex"] <= 300]
        self.assertEqual(len(first_300), 12)
        first_counts = Counter(item["device"] for item in first_300)
        self.assertEqual(first_counts, {"mac": 8, "windows": 4})
        total_counts = Counter(item["device"] for item in shards)
        self.assertEqual(total_counts, {"mac": 83, "windows": 37})

    def test_run_shard_is_atomic_resumable_and_keeps_failures_local(self):
        specs = build_profile_specs(profile_count=20, family_size=10, split_counts={"train": 10, "valid": 10, "test": 0}, seed=3)
        payloads = build_synthetic_inputs(specs, _atoms(1000), YP_CALIBRATION, PROPERTY_SCHEMA, seed=3)
        calls = []

        def renderer(payload):
            calls.append(payload["profileSeed"])
            if payload["profileSeed"].endswith("000007"):
                raise RuntimeError("transient")
            return {
                "schemaVersion": 1,
                "syntheticProfileId": "id-" + payload["profileSeed"],
                "datasetMeta": {
                    "profileSeed": payload["profileSeed"],
                    "profileFamily": payload["profileFamily"],
                    "split": payload["split"],
                    "promptVersion": "synthetic-profile-v4.4.1",
                    "targetRecordCount": payload["targetRecordCount"],
                    "actualRecordCount": payload["targetRecordCount"],
                    "bodyLengthPlan": payload["bodyLengthPlan"],
                    "actualBodyLengthMean": payload["bodyLengthPlan"]["targetMeanChars"],
                },
                "records": [
                    {"properties": {}, "bodyMd": "가" * payload["bodyLengthPlan"]["targetMeanChars"]}
                    for _ in payload["events"]
                ],
                "provenance": {"recordLineage": [event["provenance"] for event in payload["events"]]},
            }, {"elapsedSeconds": 1.0, "attempts": 1}

        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            input_dir = root / "inputs"
            input_dir.mkdir()
            for payload in payloads:
                (input_dir / f"{payload['profileSeed']}.json").write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
            shard = {"shardId": "shard-0001", "device": "windows", "profiles": [item["profileSeed"] for item in specs[:10]]}

            first = run_shard(shard, input_dir=input_dir, output_root=root, renderer=renderer)
            second = run_shard(shard, input_dir=input_dir, output_root=root, renderer=renderer)

            self.assertEqual(first["completed"], 9)
            self.assertEqual(first["failed"], 1)
            self.assertEqual(second["skipped"], 9)
            self.assertEqual(second["failed"], 1)
            self.assertEqual(calls.count("v42-profile-000001"), 1)
            self.assertEqual(calls.count("v42-profile-000007"), 2)
            self.assertFalse(list(root.rglob("*.tmp")))
            state = json.loads((root / "states" / "shard-0001.json").read_text(encoding="utf-8"))
            self.assertEqual(state["completed"], 9)
            self.assertEqual(state["failed"], 1)

    def test_inspection_rejects_family_leak_and_reports_checkpoint_counts(self):
        specs = build_profile_specs(profile_count=20, family_size=10, split_counts={"train": 10, "valid": 10, "test": 0}, seed=11)
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            profiles = root / "profiles"
            for spec in specs:
                path = profiles / spec["split"] / f"{spec['profileSeed']}.json"
                path.parent.mkdir(parents=True, exist_ok=True)
                payload = {
                    "datasetMeta": {
                        "profileSeed": spec["profileSeed"],
                        "profileFamily": spec["profileFamily"],
                        "split": spec["split"],
                        "promptVersion": "synthetic-profile-v4.4.1",
                        "actualBodyLengthMean": spec["bodyLengthPlan"]["targetMeanChars"],
                        "bodyLengthPlan": spec["bodyLengthPlan"],
                    },
                    "records": [{"properties": {}, "bodyMd": "기록입니다."}],
                    "provenance": {
                        "recordLineage": [
                            {
                                "narrativeEvidence": [f"atom-{spec['profileSeed']}"],
                                "sourceFamilies": [
                                    "deliberate-cross-split-family"
                                    if spec["sequenceIndex"] in {1, 11}
                                    else f"family-{spec['profileSeed']}"
                                ],
                            }
                        ]
                    },
                }
                path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
            report = inspect_batch(specs, output_root=root, checkpoint=20)
            self.assertEqual(report["counts"]["completed"], 20)
            self.assertEqual(report["leakage"]["profileFamilies"], 0)
            self.assertEqual(report["leakage"]["sourceAtoms"], 0)
            self.assertEqual(report["leakage"]["sourceFamilies"], 1)
            self.assertFalse(report["gatePassed"])


if __name__ == "__main__":
    unittest.main()
