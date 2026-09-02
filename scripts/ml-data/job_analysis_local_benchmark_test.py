import unittest

from job_analysis_local_benchmark import (
    percentile,
    score_reference,
    summarize_runs,
    validate_model_output,
)


class ValidateModelOutputTests(unittest.TestCase):
    def setUp(self):
        self.source = "필수: Python 3년 이상\n우대: Airflow 운영 경험\n서울에서 근무합니다."
        self.valid_output = {
            "requirements": [
                {
                    "label": "Python 3년 이상",
                    "kind": "must",
                    "axis": "technology",
                    "quote": "Python 3년 이상",
                },
                {
                    "label": "Airflow 운영 경험",
                    "kind": "nice",
                    "axis": "technology",
                    "quote": "Airflow 운영 경험",
                },
                {
                    "label": "서울 근무",
                    "kind": "must",
                    "axis": "conditions",
                    "quote": "서울에서 근무합니다.",
                },
            ],
            "normalized": {
                "technologies": ["Python", "Airflow"],
                "impacts": [],
                "roles": ["3년 이상"],
                "conditions": ["서울"],
            },
        }

    def test_accepts_contract_and_exact_source_quotes(self):
        result = validate_model_output(self.valid_output, self.source)
        self.assertTrue(result["contract_valid"])
        self.assertEqual(result["surviving_requirements"], 3)
        self.assertEqual(result["evidence_retention_rate"], 1.0)
        self.assertEqual(result["duplicate_count"], 0)

    def test_rejects_extra_fields_and_hallucinated_quote(self):
        bad = {**self.valid_output, "unexpected": True}
        bad["requirements"] = [dict(item) for item in self.valid_output["requirements"]]
        bad["requirements"][0]["quote"] = "Java 3년 이상"
        result = validate_model_output(bad, self.source)
        self.assertFalse(result["contract_valid"])
        self.assertEqual(result["surviving_requirements"], 2)
        self.assertEqual(result["hallucinated_quote_count"], 1)

    def test_non_json_output_is_not_service_acceptable(self):
        result = validate_model_output(None, self.source)
        self.assertFalse(result["service_acceptable"])


class ScoringTests(unittest.TestCase):
    def test_scores_span_kind_and_axis_separately(self):
        reference = [
            {"quote": "Python 3년 이상", "kind": "must", "axis": "technology"},
            {"quote": "Airflow 운영 경험", "kind": "nice", "axis": "technology"},
        ]
        predicted = [
            {"quote": "Python 3년 이상", "kind": "must", "axis": "role"},
            {"quote": "Airflow 운영 경험", "kind": "nice", "axis": "technology"},
            {"quote": "서울에서 근무합니다.", "kind": "must", "axis": "conditions"},
        ]
        result = score_reference(predicted, reference)
        self.assertAlmostEqual(result["span_precision"], 2 / 3)
        self.assertEqual(result["span_recall"], 1.0)
        self.assertEqual(result["kind_accuracy"], 1.0)
        self.assertEqual(result["axis_accuracy"], 0.5)

    def test_reference_span_matches_when_prediction_keeps_bullet_context(self):
        reference = [
            {"quote": "Python 3년 이상", "kind": "must", "axis": "technology"},
        ]
        predicted = [
            {"quote": "• Python 3년 이상 사용 경험", "kind": "must", "axis": "technology"},
        ]
        result = score_reference(predicted, reference)
        self.assertEqual(result["span_precision"], 1.0)
        self.assertEqual(result["span_recall"], 1.0)

    def test_percentiles_and_runtime_summary(self):
        self.assertEqual(percentile([1, 2, 3, 4], 0.5), 2.5)
        summary = summarize_runs(
            [
                {"total_duration": 1_000_000_000, "eval_count": 20, "eval_duration": 500_000_000},
                {"total_duration": 3_000_000_000, "eval_count": 20, "eval_duration": 1_000_000_000},
            ]
        )
        self.assertEqual(summary["latency_p50_seconds"], 2.0)
        self.assertEqual(summary["latency_p95_seconds"], 2.9)
        self.assertEqual(summary["generation_tokens_per_second_mean"], 30.0)


if __name__ == "__main__":
    unittest.main()
