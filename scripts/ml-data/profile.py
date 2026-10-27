import csv
import json
from datetime import datetime, timezone
from pathlib import Path

import duckdb

from profile_lib import relation_profile


ROOT = Path("var/ml-data/raw").resolve()
OUTPUT_ROOT = ROOT.parent


DATASETS = [
    {
        "id": "djinni-jobs-en",
        "format": "parquet",
        "path": ROOT / "djinni-jobs-en/data/train-00000-of-00001.parquet",
        "key": ["id"],
        "text": ["Position", "Long Description"],
        "date": "Published",
        "language": "en",
        "recordType": "job-posting",
    },
    {
        "id": "djinni-jobs-uk",
        "format": "parquet",
        "path": ROOT / "djinni-jobs-uk/data/train-00000-of-00001.parquet",
        "key": ["id"],
        "text": ["Position", "Long Description"],
        "date": "Published",
        "language": "uk",
        "recordType": "job-posting",
    },
    {
        "id": "djinni-candidates-en",
        "format": "parquet",
        "path": ROOT / "djinni-candidates-en/data/train-00000-of-00001.parquet",
        "key": ["id"],
        "text": ["Position", "Moreinfo", "Looking For", "Highlights", "CV"],
        "language": "en",
        "recordType": "candidate-profile",
    },
    {
        "id": "djinni-candidates-uk",
        "format": "parquet",
        "path": ROOT / "djinni-candidates-uk/data/train-00000-of-00001.parquet",
        "key": ["id"],
        "text": ["Position", "Moreinfo", "Looking For", "Highlights", "CV"],
        "language": "uk",
        "recordType": "candidate-profile",
    },
    {
        "id": "jth-candidates",
        "format": "csv",
        "path": ROOT / "jth/candidates.csv",
        "key": ["candidate_id"],
        "date": "create_date",
        "language": "en",
        "recordType": "candidate-profile",
    },
    {
        "id": "jth-jobs",
        "format": "csv",
        "path": ROOT / "jth/jobs.csv",
        "key": ["job_id"],
        "date": "create_date",
        "language": "en",
        "recordType": "job-posting",
    },
    {
        "id": "jth-history",
        "format": "csv",
        "path": ROOT / "jth/history.csv",
        "key": ["application_id"],
        "language": "en",
        "recordType": "application-process",
    },
]


def quote(name):
    return '"' + name.replace('"', '""') + '"'


def relation_expression(dataset):
    reader = "read_parquet" if dataset["format"] == "parquet" else "read_csv_auto"
    return f"{reader}(?)", [str(dataset["path"])]


def profile_dataset(connection, dataset):
    relation, parameters = relation_expression(dataset)
    profile = relation_profile(connection, relation, parameters, dataset["key"])
    schema = connection.execute(
        f"DESCRIBE SELECT * FROM {relation}", parameters
    ).fetchall()
    key = quote(dataset["key"][0])
    distinct_keys, null_keys = connection.execute(
        f"SELECT count(DISTINCT {key}), count(*) FILTER (WHERE {key} IS NULL) FROM {relation}",
        parameters,
    ).fetchone()

    result = {
        "id": dataset["id"],
        "recordType": dataset["recordType"],
        "language": dataset["language"],
        "format": dataset["format"],
        "path": str(dataset["path"]),
        "fileBytes": dataset["path"].stat().st_size,
        "rows": profile["rows"],
        "columns": profile["columns"],
        "schema": [{"name": row[0], "type": row[1]} for row in schema],
        "nullCells": profile["nullCells"],
        "nullRate": profile["nullRate"],
        "nullsByColumn": profile["nullsByColumn"],
        "distinctKeys": distinct_keys,
        "nullKeys": null_keys,
        "duplicateKeyRows": profile["duplicateKeyRows"],
    }

    if dataset.get("text"):
        text_expression = " + ".join(
            f"length(coalesce({quote(column)}, ''))" for column in dataset["text"]
        )
        total_chars, average_chars = connection.execute(
            f"SELECT sum({text_expression}), avg({text_expression}) FROM {relation}",
            parameters,
        ).fetchone()
        result["textColumns"] = dataset["text"]
        result["textCharacters"] = total_chars
        result["averageTextCharacters"] = average_chars

    if dataset.get("date"):
        date_column = quote(dataset["date"])
        date_cast = (
            f"try_cast({date_column} AS TIMESTAMPTZ)"
            if dataset["format"] == "parquet"
            else date_column
        )
        minimum, maximum, invalid = connection.execute(
            f"SELECT cast(min({date_cast}) AS VARCHAR), cast(max({date_cast}) AS VARCHAR), count(*) FILTER (WHERE {date_column} IS NOT NULL AND {date_cast} IS NULL) FROM {relation}",
            parameters,
        ).fetchone()
        result["dateRange"] = {
            "column": dataset["date"],
            "min": minimum,
            "max": maximum,
            "invalid": invalid,
        }

    return result


def jth_integrity(connection):
    candidates = str(ROOT / "jth/candidates.csv")
    jobs = str(ROOT / "jth/jobs.csv")
    history = str(ROOT / "jth/history.csv")
    date_columns = [
        "spontaneous_application_date",
        "shortlist_date",
        "qualification_date",
        "resume_sent_to_company_date",
        "1st_interview_date",
        "2nd_interview_date",
        "3rd_interview_date",
        "4th_interview_date",
        "job_offer_proposed_date",
        "job_offer_accepted_date",
    ]
    event_sum = " + ".join(
        f"count(*) FILTER (WHERE {quote(column)} IS NOT NULL)" for column in date_columns
    )
    event_count = connection.execute(
        f"SELECT {event_sum} FROM read_csv_auto(?)", [history]
    ).fetchone()[0]
    end_of_process_count = connection.execute(
        "SELECT count(*) FILTER (WHERE end_of_process_date IS NOT NULL) FROM read_csv_auto(?)",
        [history],
    ).fetchone()[0]
    orphan_candidates = connection.execute(
        """
        SELECT count(*) FROM read_csv_auto(?) h
        LEFT JOIN read_csv_auto(?) c USING(candidate_id)
        WHERE c.candidate_id IS NULL
        """,
        [history, candidates],
    ).fetchone()[0]
    orphan_jobs = connection.execute(
        """
        SELECT count(*) FROM read_csv_auto(?) h
        LEFT JOIN read_csv_auto(?) j USING(job_id)
        WHERE j.job_id IS NULL
        """,
        [history, jobs],
    ).fetchone()[0]
    covered_candidates, covered_jobs = connection.execute(
        "SELECT count(DISTINCT candidate_id), count(DISTINCT job_id) FROM read_csv_auto(?)",
        [history],
    ).fetchone()
    stage_distribution = connection.execute(
        "SELECT last_stage_reached, count(*) AS records FROM read_csv_auto(?) GROUP BY 1 ORDER BY 2 DESC",
        [history],
    ).fetchall()
    all_dates = " UNION ALL ".join(
        f"SELECT {quote(column)} AS event_date FROM read_csv_auto(?) WHERE {quote(column)} IS NOT NULL"
        for column in date_columns
    )
    minimum, maximum = connection.execute(
        f"SELECT min(event_date), max(event_date) FROM ({all_dates})",
        [history] * len(date_columns),
    ).fetchone()

    return {
        "stageEventDateCells": event_count,
        "endOfProcessDateCells": end_of_process_count,
        "orphanCandidateReferences": orphan_candidates,
        "orphanJobReferences": orphan_jobs,
        "candidatesWithHistory": covered_candidates,
        "jobsWithHistory": covered_jobs,
        "eventDateRange": {"min": minimum.isoformat(), "max": maximum.isoformat()},
        "lastStageDistribution": [
            {"stage": stage, "records": records} for stage, records in stage_distribution
        ],
    }


def djinni_overlap(connection):
    def overlap(kind):
        english = str(ROOT / f"djinni-{kind}-en/data/train-00000-of-00001.parquet")
        ukrainian = str(ROOT / f"djinni-{kind}-uk/data/train-00000-of-00001.parquet")
        return connection.execute(
            "SELECT count(*) FROM read_parquet(?) e INNER JOIN read_parquet(?) u USING(id)",
            [english, ukrainian],
        ).fetchone()[0]

    return {"jobIdsAcrossLanguages": overlap("jobs"), "candidateIdsAcrossLanguages": overlap("candidates")}


def main():
    connection = duckdb.connect()
    profiles = [profile_dataset(connection, dataset) for dataset in DATASETS]
    output = {
        "schemaVersion": 1,
        "profiledAt": datetime.now(timezone.utc).isoformat(),
        "datasets": profiles,
        "djinniCrossLanguageOverlap": djinni_overlap(connection),
        "jthIntegrity": jth_integrity(connection),
    }
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    (OUTPUT_ROOT / "profile.json").write_text(
        json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    with (OUTPUT_ROOT / "source-summary.csv").open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(
            file,
            fieldnames=[
                "id",
                "recordType",
                "language",
                "format",
                "rows",
                "columns",
                "fileBytes",
                "nullRate",
                "duplicateKeyRows",
                "textCharacters",
            ],
        )
        writer.writeheader()
        for profile in profiles:
            writer.writerow({field: profile.get(field) for field in writer.fieldnames})

    print(f"profile: {OUTPUT_ROOT / 'profile.json'}")
    print(f"summary: {OUTPUT_ROOT / 'source-summary.csv'}")


if __name__ == "__main__":
    main()
