#!/usr/bin/env node
/**
 * 공고 쪽 데이터를 PostgreSQL 에서 MySQL 로 옮긴다.
 *
 * 옮기는 표는 넷이다 — 수집 소스 · 기업 · 채용 공고 · 요구 역량. 사람에게 딸린
 * 것(관심 · 일치도 · 분석)은 계정과 함께 사라지므로 가져오지 않는다.
 *
 * 두 스키마가 어긋나 있어도 된다. 양쪽에 다 있는 열만 옮기고, 나머지는 MySQL
 * 쪽 기본값이 채운다. 이미 있는 id 는 건너뛰므로 여러 번 돌려도 같은 결과다.
 *
 *   SOURCE_PSQL="docker exec -i expresso-local-postgres-1 psql -U expresso -d expresso" \
 *   DATABASE_URL="mysql://expresso:expresso@127.0.0.1:53306/expresso" \
 *   node scripts/operations/copy-job-postings.mjs
 *
 * 서버에서는 SOURCE_PSQL 을 그 서버의 psql 실행 명령으로 두면 된다.
 */

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(resolve(ROOT, "packages/database/package.json"));
const { createConnection } = await import(require.resolve("mysql2/promise"));

const sourcePsql = process.env.SOURCE_PSQL
  ?? "docker exec -i expresso-local-postgres-1 psql -U expresso -d expresso";
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL(MySQL)이 필요합니다");

// 부모부터 넣는다 — 외래 키가 걸려 있다.
const tables = ["job_source", "company", "job_posting", "job_posting_requirement"];

/** psql 을 그대로 실행해 결과를 JSON 으로 받는다. 드라이버를 새로 들이지 않는다. */
function fromSource(sql) {
  const [command, ...args] = sourcePsql.split(/\s+/);
  const out = execFileSync(command, [...args, "-t", "-A", "-X", "-c", sql], {
    encoding: "utf8",
    maxBuffer: 512 * 1024 * 1024,
  });
  return JSON.parse(out.trim() || "[]");
}

function sourceColumns(table) {
  return fromSource(
    `select coalesce(json_agg(column_name), '[]'::json) from information_schema.columns
     where table_schema = 'public' and table_name = '${table}'`,
  );
}

const hexPrefix = /^\\x[0-9a-f]*$/i;

/** psql 의 JSON 값을 mysql2 가 받는 꼴로 바꾼다. */
function toMysql(value, type) {
  if (value === null || value === undefined) return null;
  if (type === "json") return JSON.stringify(value);
  if (type === "datetime") return new Date(value);
  if (type === "binary") {
    return typeof value === "string" && hexPrefix.test(value)
      ? Buffer.from(value.slice(2), "hex")
      : Buffer.from(String(value));
  }
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "object") return JSON.stringify(value);
  return value;
}

const connection = await createConnection({ uri: databaseUrl, timezone: "Z", multipleStatements: false });
const report = [];

try {
  for (const table of tables) {
    const [targetRows] = await connection.query(
      `select column_name, data_type, extra from information_schema.columns
       where table_schema = database() and table_name = ?`,
      [table],
    );
    const target = new Map(
      targetRows
        // 식 기본값도 EXTRA 에 DEFAULT_GENERATED 로 적힌다 — 생성 열만 뺀다.
        .filter((row) => !/(VIRTUAL|STORED) GENERATED/.test(String(row.EXTRA ?? row.extra ?? "")))
        .map((row) => {
          const name = row.COLUMN_NAME ?? row.column_name;
          const dataType = String(row.DATA_TYPE ?? row.data_type);
          const kind = dataType === "json"
            ? "json"
            : dataType === "datetime" || dataType === "timestamp"
              ? "datetime"
              : dataType === "blob" || dataType === "varbinary"
                ? "binary"
                : "plain";
          return [name, kind];
        }),
    );
    if (target.size === 0) throw new Error(`MySQL 에 ${table} 표가 없습니다`);

    const columns = sourceColumns(table).filter((name) => target.has(name));
    if (columns.length === 0) {
      report.push(`${table}: 옮길 열이 없습니다`);
      continue;
    }

    // 열을 하나하나 적어 객체로 만든다 — 열이 하나뿐일 때 row_to_json 이 헷갈린다.
    const asObject = columns.map((c) => `'${c}', "${c}"`).join(", ");
    const rows = fromSource(
      `select coalesce(json_agg(json_build_object(${asObject})), '[]'::json) from "${table}"`,
    );
    if (rows.length === 0) {
      report.push(`${table}: 0줄`);
      continue;
    }

    const placeholders = `(${columns.map(() => "?").join(", ")})`;
    // insert ignore 는 잘못된 값까지 조용히 삼킨다. 이미 있는 id 만 넘기고
    // 나머지 오류는 그대로 올라오게 한다.
    const insert = `insert into \`${table}\` (${columns.map((c) => `\`${c}\``).join(", ")}) values ${placeholders}`
      + " on duplicate key update `id` = `id`";
    let copied = 0;
    for (const row of rows) {
      const values = columns.map((name) => toMysql(row[name], target.get(name)));
      const [result] = await connection.query(insert, values);
      copied += result.affectedRows ?? 0;
    }
    report.push(`${table}: 읽은 ${rows.length}줄 · 새로 넣은 ${copied}줄`);
  }
} finally {
  await connection.end();
}

for (const line of report) console.info(line);
