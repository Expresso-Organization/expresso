import unittest

from synthetic_profile_luna_worker import (
    build_luna_event_context,
    find_cross_profile_sentence_repetitions,
    find_intra_profile_sentence_repetitions,
    materialize_luna_draft,
    merge_luna_bundles,
    parse_codex_bundle_jsonl,
    parse_codex_bundle_attempts,
    partition_luna_profiles,
    replace_luna_profiles,
    sentence_boost_for_body_mean,
)


def _profile(seed: str, *bodies: str) -> dict:
    return {
        "datasetMeta": {"profileSeed": seed},
        "records": [
            {"draftId": f"r{index}", "bodyMd": body}
            for index, body in enumerate(bodies, start=1)
        ],
    }


class SyntheticProfileLunaWorkerTest(unittest.TestCase):
    def test_partitions_profiles_by_expected_detail_characters(self):
        profiles = [
            {"profileSeed": "p1", "events": [{"detailLength": {"targetChars": 60}}]},
            {"profileSeed": "p2", "events": [{"detailLength": {"targetChars": 60}}]},
            {"profileSeed": "p3", "events": [{"detailLength": {"targetChars": 30}}]},
        ]

        groups = partition_luna_profiles(profiles, max_target_chars=100)

        self.assertEqual(
            [[profile["profileSeed"] for profile in group] for group in groups],
            [["p1"], ["p2", "p3"]],
        )

    def test_merges_partial_bundles_in_expected_profile_order(self):
        bundles = [
            {"shardId": "s1", "profiles": [{"profileSeed": "p2", "records": []}]},
            {"shardId": "s1", "profiles": [{"profileSeed": "p1", "records": []}]},
        ]

        merged = merge_luna_bundles(bundles, shard_id="s1", expected_seeds=["p1", "p2"])

        self.assertEqual(
            [profile["profileSeed"] for profile in merged["profiles"]],
            ["p1", "p2"],
        )

    def test_replaces_only_regenerated_profiles_in_an_existing_bundle(self):
        existing = {
            "shardId": "s1",
            "profiles": [
                {"profileSeed": "p1", "records": [{"title": "keep"}]},
                {"profileSeed": "p2", "records": [{"title": "old"}]},
            ],
        }
        replacements = {
            "shardId": "s1",
            "profiles": [{"profileSeed": "p2", "records": [{"title": "new"}]}],
        }

        merged = replace_luna_profiles(existing, replacements)

        self.assertEqual(merged["profiles"][0]["records"][0]["title"], "keep")
        self.assertEqual(merged["profiles"][1]["records"][0]["title"], "new")

    def test_increases_sentence_count_for_an_underlength_profile(self):
        self.assertEqual(
            sentence_boost_for_body_mean(actual_mean=267, target_mean=315, tolerance=47),
            2,
        )

    def test_reduces_sentence_count_for_an_overlength_profile(self):
        self.assertEqual(
            sentence_boost_for_body_mean(actual_mean=834, target_mean=666, tolerance=100),
            -2,
        )

    def test_keeps_sentence_count_when_profile_is_inside_tolerance(self):
        self.assertEqual(
            sentence_boost_for_body_mean(actual_mean=630, target_mean=666, tolerance=100),
            0,
        )

    def test_extracts_the_last_agent_json_bundle_from_codex_jsonl(self):
        stream = "\n".join(
            [
                '{"type":"thread.started","thread_id":"t1"}',
                '{"type":"item.completed","item":{"type":"agent_message","text":"{\\"shardId\\":\\"s1\\",\\"profiles\\":[]}"}}',
                '{"type":"turn.completed","usage":{"input_tokens":10}}',
            ]
        )

        bundle = parse_codex_bundle_jsonl(stream)

        self.assertEqual(bundle, {"shardId": "s1", "profiles": []})

    def test_uses_the_next_codex_attempt_after_malformed_json(self):
        malformed = '{"type":"item.completed","item":{"type":"agent_message","text":"{bad json}"}}'
        valid = '{"type":"item.completed","item":{"type":"agent_message","text":"{\\"shardId\\":\\"s1\\",\\"profiles\\":[]}"}}'

        bundle = parse_codex_bundle_attempts([malformed, valid])

        self.assertEqual(bundle, {"shardId": "s1", "profiles": []})

    def test_builds_a_compact_authorship_contract_with_detail_length(self):
        event = {
            "eventId": "ev1",
            "categoryKey": "experience",
            "facts": ["자료를 정리했다"],
            "propertyValues": {},
            "renderMode": "fixed_skeleton",
            "skeletonLead": "자료를 정리했다.",
            "bodyLengthTarget": {"targetChars": 100, "minChars": 80, "maxChars": 120},
        }

        context = build_luna_event_context(event)

        self.assertEqual(context["eventId"], "ev1")
        self.assertEqual(context["detailLength"], {"targetChars": 90, "minChars": 70, "maxChars": 110})
        self.assertEqual(context["minimumSentences"], 2)
        self.assertNotIn("provenance", context)

    def test_requires_three_sentences_for_a_hundred_ten_character_detail(self):
        event = {
            "eventId": "ev1",
            "categoryKey": "experience",
            "facts": ["자료를 정리했다"],
            "propertyValues": {},
            "renderMode": "fixed_skeleton",
            "skeletonLead": "자료를 정리했다.",
            "bodyLengthTarget": {"targetChars": 130, "minChars": 120, "maxChars": 150},
        }

        context = build_luna_event_context(event)

        self.assertEqual(context["detailLength"]["minChars"], 110)
        self.assertEqual(context["minimumSentences"], 3)

    def test_materializes_structural_fields_from_input_instead_of_luna_output(self):
        payload = {
            "profileSeed": "p1",
            "persona": {"targetRoles": ["기획"], "experienceYears": 1},
            "targetRecordCount": 2,
            "events": [
                {
                    "eventId": "ev1",
                    "categoryKey": "experience",
                    "propertyValues": {"role": "인턴"},
                    "renderMode": "fixed_skeleton",
                    "skeletonLead": "자료를 정리했다.",
                },
                {
                    "eventId": "ev2",
                    "categoryKey": "project",
                    "propertyValues": {},
                    "renderMode": "rewrite_evidence",
                    "skeletonLead": "",
                },
            ],
        }
        authored = {
            "profileSeed": "p1",
            "records": [
                {"eventId": "ev1", "title": "자료 정리", "detailMd": "분류 기준을 새로 세웠다."},
                {"eventId": "ev2", "title": "팀 프로젝트", "detailMd": "팀원과 결과물을 완성했다."},
            ],
        }

        draft = materialize_luna_draft(payload, authored)

        self.assertEqual(
            draft,
            {
                "status": "generated",
                "profileSeed": "p1",
                "persona": {"targetRoles": ["기획"], "experienceYears": 1},
                "records": [
                    {
                        "draftId": "r1",
                        "eventId": "ev1",
                        "categoryKey": "experience",
                        "title": "자료 정리",
                        "properties": {"role": "인턴"},
                        "bodyMd": "자료를 정리했다. 분류 기준을 새로 세웠다.",
                    },
                    {
                        "draftId": "r2",
                        "eventId": "ev2",
                        "categoryKey": "project",
                        "title": "팀 프로젝트",
                        "properties": {},
                        "bodyMd": "팀원과 결과물을 완성했다.",
                    },
                ],
            },
        )

    def test_rejects_luna_records_in_the_wrong_event_order(self):
        payload = {
            "profileSeed": "p1",
            "persona": {},
            "targetRecordCount": 2,
            "events": [
                {"eventId": "ev1", "categoryKey": "experience", "propertyValues": {}, "renderMode": "rewrite_evidence"},
                {"eventId": "ev2", "categoryKey": "project", "propertyValues": {}, "renderMode": "rewrite_evidence"},
            ],
        }
        authored = {
            "profileSeed": "p1",
            "records": [
                {"eventId": "ev2", "title": "둘째", "detailMd": "둘째 기록이다."},
                {"eventId": "ev1", "title": "첫째", "detailMd": "첫째 기록이다."},
            ],
        }

        with self.assertRaisesRegex(ValueError, "event order"):
            materialize_luna_draft(payload, authored)

    def test_removes_a_duplicated_fixed_skeleton_from_luna_detail(self):
        payload = {
            "profileSeed": "p1",
            "persona": {},
            "targetRecordCount": 1,
            "events": [
                {
                    "eventId": "ev1",
                    "categoryKey": "experience",
                    "propertyValues": {},
                    "renderMode": "fixed_skeleton",
                    "skeletonLead": "자료를 정리했다.",
                }
            ],
        }
        authored = {
            "profileSeed": "p1",
            "records": [
                {
                    "eventId": "ev1",
                    "title": "자료 정리",
                    "detailMd": "자료를 정리했다. 분류 기준을 새로 세웠다.",
                }
            ],
        }

        draft = materialize_luna_draft(payload, authored)

        self.assertEqual(draft["records"][0]["bodyMd"], "자료를 정리했다. 분류 기준을 새로 세웠다.")

    def test_rejects_sentence_repeated_across_three_profiles(self):
        repeated = "누락된 신청 내역을 확인하고 담당자별 처리 순서를 다시 정리했다."
        profiles = [
            _profile("p1", repeated),
            _profile("p2", repeated),
            _profile("p3", repeated),
        ]

        issues = find_cross_profile_sentence_repetitions(profiles, threshold=3)

        self.assertEqual(len(issues), 1)
        self.assertEqual(issues[0]["profileCount"], 3)
        self.assertEqual(issues[0]["occurrences"], 3)

    def test_allows_sentence_used_by_at_most_two_profiles(self):
        repeated = "누락된 신청 내역을 확인하고 담당자별 처리 순서를 다시 정리했다."

        issues = find_cross_profile_sentence_repetitions(
            [_profile("p1", repeated), _profile("p2", repeated)],
            threshold=3,
        )

        self.assertEqual(issues, [])

    def test_ignores_a_repeated_sentence_when_it_is_an_input_skeleton(self):
        repeated = "사업 기획 분야에서 일정 관리 업무를 맡았다."
        profiles = [
            _profile("p1", repeated + " 첫 번째 세부 작업을 기록했다."),
            _profile("p2", repeated + " 두 번째 세부 작업을 기록했다."),
            _profile("p3", repeated + " 세 번째 세부 작업을 기록했다."),
        ]

        issues = find_cross_profile_sentence_repetitions(
            profiles,
            threshold=3,
            ignored_sentences_by_profile={
                "p1": {repeated.rstrip(".")},
                "p2": {repeated.rstrip(".")},
                "p3": {repeated.rstrip(".")},
            },
        )

        self.assertEqual(issues, [])

    def test_rejects_same_sentence_in_two_records_of_one_profile(self):
        repeated = "검토 기준을 표로 정리해 다음 담당자가 바로 확인할 수 있게 했다."

        issues = find_intra_profile_sentence_repetitions(
            _profile("p1", repeated, repeated)
        )

        self.assertEqual(len(issues), 1)
        self.assertEqual(issues[0]["occurrences"], 2)


if __name__ == "__main__":
    unittest.main()
