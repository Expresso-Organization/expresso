def _quote_identifier(name):
    return '"' + name.replace('"', '""') + '"'


def relation_profile(connection, relation_sql, parameters, key_columns=None):
    columns = [
        row[0]
        for row in connection.execute(
            f"DESCRIBE SELECT * FROM {relation_sql}", parameters
        ).fetchall()
    ]
    row_count = connection.execute(
        f"SELECT count(*) FROM {relation_sql}", parameters
    ).fetchone()[0]

    null_expressions = [
        f"count(*) FILTER (WHERE {_quote_identifier(column)} IS NULL) AS {_quote_identifier(column)}"
        for column in columns
    ]
    null_values = connection.execute(
        f"SELECT {', '.join(null_expressions)} FROM {relation_sql}", parameters
    ).fetchone()
    nulls_by_column = dict(zip(columns, null_values))
    null_cells = sum(null_values)
    cell_count = row_count * len(columns)

    duplicate_key_rows = None
    if key_columns:
        quoted_keys = ", ".join(_quote_identifier(column) for column in key_columns)
        non_null_keys = " AND ".join(
            f"{_quote_identifier(column)} IS NOT NULL" for column in key_columns
        )
        duplicate_key_rows = connection.execute(
            f"""
            SELECT coalesce(sum(group_size - 1), 0)::BIGINT
            FROM (
              SELECT count(*) AS group_size
              FROM {relation_sql}
              WHERE {non_null_keys}
              GROUP BY {quoted_keys}
              HAVING count(*) > 1
            )
            """,
            parameters,
        ).fetchone()[0]

    return {
        "rows": row_count,
        "columns": len(columns),
        "nullCells": null_cells,
        "nullRate": null_cells / cell_count if cell_count else 0,
        "duplicateKeyRows": duplicate_key_rows,
        "nullsByColumn": nulls_by_column,
    }
