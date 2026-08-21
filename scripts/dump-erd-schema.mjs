#!/usr/bin/env node
/**
 * 구조 다이어그램의 V1(현재 구현) 자료를 스키마에서 다시 뽑는다.
 *
 * `docs/Expresso ERD.dc.html` 의 V1 은 손으로 적는 그림이 아니라 지금 돌고 있는
 * 스키마의 사본이다. 임시 데이터베이스를 하나 만들어 마이그레이션을 전부 적용한
 * 뒤 information_schema 에서 테이블 · 컬럼 · 기본 키 · 외래 키를 읽어
 * `<erd-v1:auto>` 구간을 갈아 끼운다. 사람이 정한 것 — 테이블의 한국어 이름과
 * ZONES1 의 자리 배치 — 은 문서에서 그대로 읽어 보존하고, 이름이나 자리가 없는
 * 새 테이블이 있으면 멈춘다.
 *
 * 돌고 있는 MySQL 이 있어야 한다. 주소는 DATABASE_URL · TEST_DATABASE_URL 에서
 * 읽고, 없으면 `pnpm infra:up` 이 띄우는 로컬 주소를 쓴다.
 *
 *   node scripts/dump-erd-schema.mjs           갈아 끼운다
 *   node scripts/dump-erd-schema.mjs --check   달라진 것이 있으면 1 로 끝난다(CI 용)
 */

import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS = resolve(ROOT, "packages/database/migrations");
const DOC = resolve(ROOT, "docs/Expresso ERD.dc.html");
const OPEN = "// <erd-v1:auto> — 여기서부터 자동 생성";
const CLOSE = "// </erd-v1:auto>";

// mysql2 는 @expresso/database 의 의존성이라 그 자리에서 찾는다
const req = createRequire(resolve(ROOT, "packages/database/package.json"));
const mysql = await import(req.resolve("mysql2/promise"));

const DATABASE_URL = process.env.DATABASE_URL
  ?? process.env.TEST_DATABASE_URL
  ?? "mysql://expresso:expresso@127.0.0.1:53306/expresso";

// text 계열은 이름을 그대로 둔다 — 담는 양이 64KB · 16MB · 4GB 로 갈리므로
// 한데 묶으면 그림이 그 차이를 감춘다.
const TYPE = {
  datetime: "datetime",
  timestamp: "datetime",
  bigint: "int8",
  smallint: "int2",
  tinyint: "int1",
  double: "float8",
};
// tinyint(1) 은 MySQL 의 참거짓 자리다.
const shorten = (row) =>
  row.column_type === "tinyint(1)" ? "bool" : TYPE[row.data_type] ?? row.data_type;

async function schema() {
  const files = (await readdir(MIGRATIONS)).filter((f) => f.endsWith(".sql")).sort();
  const name = `expresso_erd_${randomUUID().replaceAll("-", "")}`.slice(0, 60);
  const root = new URL(DATABASE_URL);
  const adminUrl = new URL(root); adminUrl.pathname = "/mysql";
  const admin = await mysql.createConnection({ uri: adminUrl.toString() });
  await admin.query(`create database \`${name}\` character set utf8mb4 collate utf8mb4_bin`);

  const isolated = new URL(root); isolated.pathname = `/${name}`;
  const db = await mysql.createConnection({ uri: isolated.toString(), multipleStatements: true });
  try {
    for (const file of files) await db.query(await readFile(resolve(MIGRATIONS, file), "utf8"));

    const [columns] = await db.query(`
      select table_name as table_name, column_name as column_name,
             data_type as data_type, column_type as column_type
      from information_schema.columns
      where table_schema = ?
      order by table_name, ordinal_position`, [name]);

    const [pks] = await db.query(`
      select key_column.table_name as table_name, key_column.column_name as column_name
      from information_schema.table_constraints as constraints
      join information_schema.key_column_usage as key_column
        on key_column.constraint_schema = constraints.constraint_schema
       and key_column.constraint_name = constraints.constraint_name
       and key_column.table_name = constraints.table_name
      where constraints.constraint_schema = ? and constraints.constraint_type = 'PRIMARY KEY'`, [name]);

    // 한 제약이 열 여럿을 걸면 information_schema 는 줄 여럿으로 준다 — 이름으로 다시 묶는다.
    const [parts] = await db.query(`
      select constraint_name as constraint_name, table_name as table_name,
             referenced_table_name as ref_table, column_name as column_name,
             referenced_column_name as ref_column
      from information_schema.key_column_usage
      where constraint_schema = ? and referenced_table_name is not null
      order by table_name, constraint_name, ordinal_position`, [name]);
    const grouped = new Map();
    for (const part of parts) {
      const key = `${part.table_name}.${part.constraint_name}`;
      const found = grouped.get(key)
        ?? grouped.set(key, {
          table_name: part.table_name, ref_table: part.ref_table, cols: [], refcols: [],
        }).get(key);
      found.cols.push(part.column_name);
      found.refcols.push(part.ref_column);
    }
    const fks = [...grouped.values()]
      .sort((a, b) => a.table_name.localeCompare(b.table_name) || a.ref_table.localeCompare(b.ref_table));

    return { count: files.length, columns, pks, fks };
  } finally {
    await db.end();
    await admin.query(`drop database if exists \`${name}\``);
    await admin.end();
  }
}

function render({ count, columns, pks, fks }, names, order) {
  const cols = new Map();
  for (const c of columns) (cols.get(c.table_name) ?? cols.set(c.table_name, []).get(c.table_name)).push(c);
  const pk = new Map();
  for (const r of pks) (pk.get(r.table_name) ?? pk.set(r.table_name, new Set()).get(r.table_name)).add(r.column_name);

  // 제약 하나가 선 하나. 복합 키 (user_id, x_id) 는 부모의 id 를 가리키는 열이 대표다.
  const fkCols = new Map();
  const edges = [];
  for (const f of fks) {
    const pairs = f.cols.map((c, i) => [c, f.refcols[i]]);
    const lead = pairs.find(([, ref]) => ref === "id") ?? pairs.at(-1);
    edges.push(`${f.table_name}.${lead[0]}>${f.ref_table}`);
    const set = fkCols.get(f.table_name) ?? fkCols.set(f.table_name, new Set()).get(f.table_name);
    for (const [c] of pairs) set.add(c);
  }

  const tables = [...cols.keys()];
  const unnamed = tables.filter((t) => !names.has(t));
  const unplaced = tables.filter((t) => !order.includes(t));
  const gone = order.filter((t) => !cols.has(t));
  if (unnamed.length) throw new Error(`한국어 이름이 없는 테이블: ${unnamed.join(", ")} — 문서의 T1 에 먼저 적으십시오`);
  if (unplaced.length) throw new Error(`ZONES1 에 자리가 없는 테이블: ${unplaced.join(", ")} — 문서의 ZONES1 에 먼저 넣으십시오`);
  if (gone.length) throw new Error(`스키마에 없는데 ZONES1 에 남아 있는 테이블: ${gone.join(", ")}`);

  const rows = order.map((t) => {
    const fields = cols.get(t).map((c) => {
      const flag = pk.get(t)?.has(c.column_name) ? ":pk" : fkCols.get(t)?.has(c.column_name) ? ":fk" : "";
      return `${c.column_name}:${shorten(c)}${flag}`;
    });
    return `  ['${t}', '${names.get(t)}', '${fields.join("|")}'],`;
  });

  const edgeLines = [];
  const sorted = edges.sort().map((e) => `'${e}'`);
  for (let i = 0; i < sorted.length; i += 4) edgeLines.push(`  ${sorted.slice(i, i + 4).join(", ")},`);

  return [
    OPEN,
    `// 마이그레이션 0001–${String(count).padStart(4, "0")} 적용 기준`,
    "const T1 = [",
    ...rows,
    "];",
    "",
    "// 실제 외래 키 — 한 제약이 선 하나. 복합 키(user_id, x_id)는 부모의 id 를 가리키는 열로 잡습니다.",
    "const EDGES1 = [",
    ...edgeLines,
    "];",
    CLOSE,
  ].join("\n");
}

const doc = await readFile(DOC, "utf8");
const from = doc.indexOf(OPEN);
const to = doc.indexOf(CLOSE);
if (from < 0 || to < 0) throw new Error(`${DOC} 에서 ${OPEN} 구간을 찾지 못했습니다`);

const names = new Map([...doc.slice(from, to).matchAll(/\n {2}\['([^']+)', '([^']+)',/g)].map((m) => [m[1], m[2]]));
const zones = doc.slice(doc.indexOf("const ZONES1 = ["));
const order = [...zones.slice(0, zones.indexOf("\n];")).matchAll(/'([a-z_]+)'/g)]
  .map((m) => m[1])
  .filter((t, i, all) => names.has(t) || all.indexOf(t) === i);
const placed = order.filter((t) => !["A", "B", "C", "D", "E", "F", "G"].includes(t));

const next = doc.slice(0, from) + render(await schema(), names, placed) + doc.slice(to + CLOSE.length);
if (next === doc) {
  console.log("변한 것 없음 — V1 은 지금 스키마와 같습니다");
  process.exit(0);
}
if (process.argv.includes("--check")) {
  console.error("V1 이 지금 스키마와 다릅니다 — node scripts/dump-erd-schema.mjs 로 갈아 끼우십시오");
  process.exit(1);
}
await writeFile(DOC, next);
console.log("V1 을 다시 뽑았습니다");
