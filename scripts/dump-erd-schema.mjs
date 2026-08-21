#!/usr/bin/env node
/**
 * 구조 다이어그램의 V1(현재 구현) 자료를 스키마에서 다시 뽑는다.
 *
 * `docs/Expresso ERD.dc.html` 의 V1 은 손으로 적는 그림이 아니라 지금 돌고 있는
 * 스키마의 사본이다. 마이그레이션을 PGlite 에 전부 적용한 뒤 pg_catalog 에서
 * 테이블 · 컬럼 · 기본 키 · 외래 키를 읽어 `<erd-v1:auto>` 구간을 갈아 끼운다.
 * 사람이 정한 것 — 테이블의 한국어 이름과 ZONES1 의 자리 배치 — 은 문서에서
 * 그대로 읽어 보존하고, 이름이나 자리가 없는 새 테이블이 있으면 멈춘다.
 *
 *   node scripts/dump-erd-schema.mjs           갈아 끼운다
 *   node scripts/dump-erd-schema.mjs --check   달라진 것이 있으면 1 로 끝난다(CI 용)
 */

import { createRequire } from "node:module";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS = resolve(ROOT, "packages/database/migrations");
const DOC = resolve(ROOT, "docs/Expresso ERD.dc.html");
const OPEN = "// <erd-v1:auto> — 여기서부터 자동 생성";
const CLOSE = "// </erd-v1:auto>";

// pglite 는 @expresso/database 의 개발 의존성이라 그 자리에서 찾는다
const req = createRequire(resolve(ROOT, "packages/database/package.json"));
const { PGlite } = await import(req.resolve("@electric-sql/pglite"));
const { citext } = await import(req.resolve("@electric-sql/pglite/contrib/citext"));

const TYPE = {
  "timestamp with time zone": "tstz",
  integer: "int",
  bigint: "int8",
  smallint: "int2",
  boolean: "bool",
  "double precision": "float8",
};
const shorten = (row) =>
  row.typtype === "e" ? "enum"
  : row.type.startsWith("character varying") ? "varchar"
  : TYPE[row.type] ?? row.type;

async function schema() {
  const files = (await readdir(MIGRATIONS)).filter((f) => f.endsWith(".sql")).sort();
  const db = new PGlite({ extensions: { citext } });
  for (const file of files) await db.exec(await readFile(resolve(MIGRATIONS, file), "utf8"));

  const columns = await db.query(`
    select c.relname as table_name, a.attname as column_name,
           format_type(a.atttypid, a.atttypmod) as type, t.typtype
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
    join pg_type t on t.oid = a.atttypid
    where c.relkind = 'r'
    order by c.relname, a.attnum`);

  const pks = await db.query(`
    select rel.relname as table_name, att.attname as column_name
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join unnest(con.conkey) as k(attnum) on true
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = k.attnum
    where con.contype = 'p'`);

  const fks = await db.query(`
    select src.relname as table_name, tgt.relname as ref_table,
      (select array_agg(a.attname order by u.ord) from unnest(con.conkey) with ordinality u(attnum, ord)
        join pg_attribute a on a.attrelid = con.conrelid and a.attnum = u.attnum) as cols,
      (select array_agg(a.attname order by u.ord) from unnest(con.confkey) with ordinality u(attnum, ord)
        join pg_attribute a on a.attrelid = con.confrelid and a.attnum = u.attnum) as refcols
    from pg_constraint con
    join pg_class src on src.oid = con.conrelid
    join pg_class tgt on tgt.oid = con.confrelid
    where con.contype = 'f'
    order by src.relname, tgt.relname`);

  return { count: files.length, columns: columns.rows, pks: pks.rows, fks: fks.rows };
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
