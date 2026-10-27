import tempfile
import unittest
from pathlib import Path

import duckdb

from profile_lib import relation_profile
from profile import profile_dataset


class RelationProfileTest(unittest.TestCase):
    def test_counts_rows_columns_nulls_and_duplicate_keys(self):
        with tempfile.TemporaryDirectory() as directory:
            csv_path = Path(directory) / "fixture.csv"
            csv_path.write_text("id,name,score\n1,Ada,10\n1,,20\n2,Linus,\n", encoding="utf-8")
            connection = duckdb.connect()

            profile = relation_profile(
                connection,
                "read_csv_auto(?)",
                [str(csv_path)],
                key_columns=["id"],
            )

            self.assertEqual(profile["rows"], 3)
            self.assertEqual(profile["columns"], 3)
            self.assertEqual(profile["nullCells"], 2)
            self.assertAlmostEqual(profile["nullRate"], 2 / 9)
            self.assertEqual(profile["duplicateKeyRows"], 1)
            self.assertEqual(profile["nullsByColumn"], {"id": 0, "name": 1, "score": 1})

    def test_serializes_timezone_date_range_without_optional_pytz_dependency(self):
        with tempfile.TemporaryDirectory() as directory:
            parquet_path = Path(directory) / "fixture.parquet"
            connection = duckdb.connect()
            connection.execute(
                """
                COPY (
                  SELECT 'a' AS id, '2022-01-01T00:00:00+02:00' AS Published
                  UNION ALL
                  SELECT 'b' AS id, '2023-01-01T00:00:00+02:00' AS Published
                ) TO ? (FORMAT PARQUET)
                """,
                [str(parquet_path)],
            )

            profile = profile_dataset(
                connection,
                {
                    "id": "fixture",
                    "format": "parquet",
                    "path": parquet_path,
                    "key": ["id"],
                    "date": "Published",
                    "language": "en",
                    "recordType": "fixture",
                },
            )

            self.assertEqual(profile["dateRange"]["min"], "2022-01-01 07:00:00+09")
            self.assertEqual(profile["dateRange"]["max"], "2023-01-01 07:00:00+09")


if __name__ == "__main__":
    unittest.main()
