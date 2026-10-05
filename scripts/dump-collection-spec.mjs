#!/usr/bin/env node
/**
 * 설계서 8.2 컬렉션 명세서를 MongoDB 스키마에서 다시 뽑는다.
 *
 * 명세서는 손으로 옮겨 적는 표가 아니라 지금 적용되는 스키마의 사본이다. 임시
 * 데이터베이스를 하나 만들어 `@expresso/database`의 마이그레이션을 전부 적용한 뒤
 * listCollections 의 validator 와 listIndexes 를 읽어 `<!-- collection-spec:auto -->`
 * 구간을 갈아 끼운다. 사람이 정한 것 — 컬렉션을 어느 영역에 두는가 — 은 문서의
 * 「컬렉션 목록」 표에서 그대로 읽어 보존하고, 표와 스키마의 컬렉션이 다르면 멈춘다.
 *
 * 돌고 있는 MongoDB 가 있어야 한다. 주소는 TEST_MONGODB_URL 에서 읽고, 없으면
 * `pnpm infra:up` 이 띄우는 로컬 관리자 주소를 쓴다. `@expresso/database` 를 먼저
 * 지어야 한다(`pnpm --filter @expresso/database build`).
 *
 *   node scripts/dump-collection-spec.mjs           갈아 끼운다
 *   node scripts/dump-collection-spec.mjs --check   달라진 것이 있으면 1 로 끝난다
 */

import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DOC = resolve(ROOT, "docs/졸업작품-설계서.html");
const OPEN = "<!-- collection-spec:auto — 여기서부터 scripts/dump-collection-spec.mjs 가 생성 -->";
const CLOSE = "<!-- /collection-spec:auto -->";
const CHECK = process.argv.includes("--check");

const DATABASE_URL = process.env.TEST_MONGODB_URL
  ?? "mongodb://admin:expresso-admin@127.0.0.1:57017/admin?authSource=admin&replicaSet=rs0";

// mongodb 와 마이그레이션은 @expresso/database 의 것을 그 자리에서 쓴다
const req = createRequire(resolve(ROOT, "packages/database/package.json"));
const { MongoClient } = await import(req.resolve("mongodb"));
const { migrateMongo } = await import(pathToFileURL(resolve(ROOT, "packages/database/dist/index.js")).href);

const UUID_PATTERN = "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$";
const ANY = ["object", "array", "string", "bool", "int", "long", "double", "null"];
const TYPE = {
  string: "문자열", date: "날짜", int: "정수", long: "정수", double: "실수", decimal: "실수",
  bool: "참거짓", object: "객체", array: "배열", binData: "이진", objectId: "ObjectId",
};

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);

async function readSchema() {
  const name = `expresso_spec_${randomUUID().replaceAll("-", "")}`.slice(0, 60);
  await migrateMongo({ databaseUrl: DATABASE_URL, databaseName: name });
  const client = new MongoClient(DATABASE_URL, { serverSelectionTimeoutMS: 3_000 });
  try {
    const db = client.db(name);
    const infos = await db.listCollections({}, { nameOnly: false }).toArray();
    const out = new Map();
    for (const info of infos) {
      if (info.name.startsWith("system.")) continue;
      const indexes = await db.collection(info.name).listIndexes().toArray();
      out.set(info.name, { schema: info.options?.validator?.$jsonSchema ?? null, indexes });
    }
    return out;
  } finally {
    await client.db(name).dropDatabase().catch(() => {});
    await client.close();
  }
}

/** bsonType 하나 또는 배열을 한국어 타입과 null 허용 여부로 바꾼다. */
function typeOf(node) {
  if (!node) return { type: "임의 값", nullable: false };
  if (node.anyOf) {
    const parts = node.anyOf.map(typeOf);
    const nullable = parts.some((p) => p.nullable || p.type === "null");
    const types = [...new Set(parts.map((p) => p.type).filter((t) => t !== "null"))];
    return { type: types.join(" · ") || "null", nullable };
  }
  let t = node.bsonType;
  if (t === undefined) return { type: node.enum ? "열거형" : "임의 값", nullable: false };
  const list = Array.isArray(t) ? t : [t];
  if (ANY.every((x) => list.includes(x))) return { type: "임의 값", nullable: true };
  const nullable = list.includes("null");
  const rest = [...new Set(list.filter((x) => x !== "null").map((x) => TYPE[x] ?? x))];
  let type = rest.join(" · ") || "null";
  if (type === "문자열" && node.pattern === UUID_PATTERN) type = "UUID 문자열";
  // int · long · double 을 함께 받되 multipleOf 1 이면 값은 정수다
  if (node.multipleOf === 1 && rest.includes("정수")) type = "정수";
  return { type, nullable };
}

/** validator 노드의 제약을 짧은 문장으로 모은다. */
function constraints(node, nullable) {
  const out = [];
  if (!node) return "";
  const src = node.anyOf ? node.anyOf.find((b) => b.bsonType !== "null") ?? {} : node;
  if (src.enum) out.push(src.enum.map((v) => `<code>${esc(v)}</code>`).join(" · "));
  if (src.pattern && src.pattern !== UUID_PATTERN) out.push(`형식 <code>${esc(src.pattern)}</code>`);
  if (src.maxLength !== undefined && src.pattern !== UUID_PATTERN) out.push(`최대 ${src.maxLength}자`);
  if (src.minLength !== undefined && src.minLength > 0) out.push(`최소 ${src.minLength}자`);
  if (src.minimum !== undefined) out.push(`≥ ${src.minimum}`);
  if (src.maximum !== undefined) out.push(`≤ ${src.maximum}`);
  if (src.minItems !== undefined && src.minItems > 0) out.push(`최소 ${src.minItems}개`);
  if (src.maxItems !== undefined) out.push(`최대 ${src.maxItems}개`);
  if (nullable) out.push("null 허용");
  return out.join(" · ");
}

/** 객체 스키마를 `부모.자식` 경로의 행으로 펼친다. 깊이는 두 단계까지만. */
function rows(schema, prefix = "", depth = 0) {
  const out = [];
  const props = schema?.properties ?? {};
  const required = new Set(schema?.required ?? []);
  for (const [key, node] of Object.entries(props)) {
    const path = prefix ? `${prefix}.${key}` : key;
    const { type, nullable } = typeOf(node);
    out.push({ path, type, required: required.has(key), constraint: constraints(node, nullable) });
    if (depth >= 1) continue;
    const objectBranch = node.anyOf
      ? node.anyOf.filter((b) => b.properties).length === 1 ? node.anyOf.find((b) => b.properties) : null
      : node.properties ? node : null;
    if (objectBranch) out.push(...rows(objectBranch, path, depth + 1));
    const items = node.items ?? node.anyOf?.find((b) => b.items)?.items;
    if (items?.properties) out.push(...rows(items, `${path}[]`, depth + 1));
  }
  return out;
}

function indexText(ix) {
  const keys = Object.entries(ix.key).map(([k, v]) => `${k} ${v === 1 ? "↑" : v === -1 ? "↓" : v}`).join(", ");
  const flags = [];
  if (ix.unique) flags.push("유일");
  if (ix.partialFilterExpression) flags.push("부분");
  if (ix.expireAfterSeconds !== undefined) flags.push(`만료 ${ix.expireAfterSeconds}초`);
  if (ix.sparse) flags.push("희소");
  return `<code>${esc(keys)}</code>${flags.length ? ` (${flags.join(" · ")})` : ""}`;
}

/** 문서의 「컬렉션 목록」 표에서 영역과 컬렉션 순서를 읽는다. */
function readRegions(html) {
  const s = html.indexOf("■ 컬렉션 목록</h4>");
  if (s < 0) throw new Error("8.2 「컬렉션 목록」 표를 찾지 못했다");
  const body = html.slice(s, html.indexOf("</table>", s));
  const regions = [];
  for (const m of body.matchAll(/<tr><td>([^<]+)<\/td><td>(.*?)<\/td><td class="num">(\d+)<\/td><\/tr>/g)) {
    const names = [...m[2].matchAll(/<code>([^<]+)<\/code>/g)].map((x) => x[1]);
    regions.push({ name: m[1], names, count: Number(m[3]) });
  }
  return regions;
}

function render(regions, schema) {
  const parts = [OPEN];
  let n = 0;
  for (const region of regions) {
    parts.push(`      <h4 data-page="0">■ ${esc(region.name)}</h4>`);
    for (const name of region.names) {
      n += 1;
      const { schema: js, indexes } = schema.get(name);
      const body = rows(js).map((r) =>
        `        <tr><td><code>${esc(r.path)}</code></td><td>${esc(r.type)}</td><td class="num">${r.required ? "O" : "—"}</td><td>${r.constraint}</td></tr>`);
      const ix = indexes.filter((i) => i.name !== "_id_").map(indexText);
      parts.push(
        `      <div class="table-wrap"><table><thead><tr><th>필드</th><th>타입</th><th class="num">필수</th><th>제약</th></tr></thead><tbody>`,
        ...(body.length ? body : [`        <tr><td colspan="4">validator 없음</td></tr>`]),
        `      </tbody><caption>표 8.2.${n} <code>${esc(name)}</code>${ix.length ? ` · 인덱스 ${ix.join(" · ")}` : ""}</caption></table></div>`,
      );
    }
  }
  parts.push(`      ${CLOSE}`);
  return parts.join("\n");
}

const html = await readFile(DOC, "utf8");
const regions = readRegions(html);
const schema = await readSchema();
const listed = regions.flatMap((r) => r.names);
const missing = [...schema.keys()].filter((n) => !listed.includes(n));
const extra = listed.filter((n) => !schema.has(n));
const miscount = regions.filter((r) => r.names.length !== r.count).map((r) => r.name);
if (missing.length || extra.length || miscount.length) {
  if (missing.length) console.error(`영역 표에 없는 컬렉션: ${missing.join(", ")}`);
  if (extra.length) console.error(`스키마에 없는 컬렉션: ${extra.join(", ")}`);
  if (miscount.length) console.error(`개수 칸이 틀린 영역: ${miscount.join(", ")}`);
  process.exit(2);
}

const a = html.indexOf(OPEN);
const b = html.indexOf(CLOSE);
if (a < 0 || b < 0) throw new Error("8.2 자동 생성 구간 표식을 찾지 못했다");
const next = html.slice(0, a) + render(regions, schema) + html.slice(b + CLOSE.length);
// data-page 는 PDF 를 뽑을 때 새기는 값이므로 비교에서 뺀다
const strip = (s) => s.slice(s.indexOf(OPEN), s.indexOf(CLOSE)).replace(/data-page="\d+"/g, "");
if (CHECK) {
  const same = strip(html) === strip(next);
  console.log(same ? `컬렉션 ${schema.size}개 · 문서와 같다` : "8.2 명세서가 스키마와 다르다 — 스크립트를 다시 돌린다");
  process.exit(same ? 0 : 1);
}
await writeFile(DOC, next);
console.log(`컬렉션 ${schema.size}개 · 8.2 명세서를 갈아 끼웠다`);
