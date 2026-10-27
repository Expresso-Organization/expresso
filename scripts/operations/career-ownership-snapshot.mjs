#!/usr/bin/env node
/**
 * 0017(career_category_ownership) 이관 전후를 비교할 스냅샷.
 *
 * 사용자마다 기록(휴지통 포함) · 카테고리 키별 기록 · 저장한 보기 · 관계 · 연결 수와,
 * 공고마다 일치도 점수를 낸다. 점수는 이관 전에는 원래 식
 * (`제목 · 본문 · JSON.stringify(properties)`)으로, 이관 뒤에는 서버의
 * `careerRecordTextReader`로 기록 글을 만들어 같은 `calculateExplainableMatch`에 넣는다.
 *
 *   pnpm --filter @expresso/backend build
 *   MONGODB_URL=... node scripts/operations/career-ownership-snapshot.mjs --db <이름> --phase before > before.json
 *   MONGODB_URL=... node scripts/operations/career-ownership-snapshot.mjs --db <이름> --phase after > after.json
 *   node scripts/operations/career-ownership-snapshot.mjs --compare before.json after.json
 */
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { MongoClient } from "mongodb";

const { values, positionals } = parseArgs({ options: { db: { type: "string" }, phase: { type: "string" }, compare: { type: "boolean" } }, allowPositionals: true });

if (values.compare) {
  const [before, after] = await Promise.all(positionals.map(async (path) => JSON.parse(await readFile(path, "utf8"))));
  const differences = [];
  for (const userId of new Set([...Object.keys(before.users), ...Object.keys(after.users)])) {
    const left = JSON.stringify(before.users[userId] ?? null);
    const right = JSON.stringify(after.users[userId] ?? null);
    if (left !== right) differences.push({ userId, before: before.users[userId] ?? null, after: after.users[userId] ?? null });
  }
  console.log(JSON.stringify({ users: Object.keys(after.users).length, scoredPairs: Object.values(after.users).reduce((sum, user) => sum + Object.keys(user.matchTotals).length, 0), differences }, null, 2));
  process.exit(differences.length ? 1 : 0);
}

if (!values.db || !["before", "after"].includes(values.phase ?? "")) throw new Error("--db <이름> --phase before|after가 필요합니다");
const url = process.env.MONGODB_URL;
if (!url) throw new Error("MONGODB_URL이 필요합니다");
const { calculateExplainableMatch } = await import("../../services/backend/dist/modules/jobs/match-score.js");
const { JobRequirementsSchema } = await import("../../packages/contracts/dist/index.js");
const client = new MongoClient(url);
await client.connect();
try {
  const db = client.db(values.db);
  const reader = values.phase === "after" ? (await import("../../services/backend/dist/modules/career/index.js")).careerRecordTextReader : null;
  const postings = (await db.collection("job_postings").find({ requirements: { $exists: true } }, { projection: { _id: 1, requirements: 1 } }).toArray())
    .flatMap((posting) => { const parsed = JobRequirementsSchema.safeParse(posting.requirements); return parsed.success ? [{ id: posting._id, requirements: parsed.data }] : []; });
  const categoryKeys = new Map((await db.collection("career_categories").find({}, { projection: { _id: 1, key: 1 } }).toArray()).map((category) => [category._id, category.key]));
  const users = {};
  for (const userId of (await db.collection("career_records").distinct("userId")).sort()) {
    const records = await db.collection("career_records").find({ userId }).sort({ _id: 1 }).toArray();
    const active = records.filter((record) => record.deletedAt == null);
    const byCategory = {};
    for (const record of records) { const key = categoryKeys.get(record.categoryId) ?? "(없음)"; byCategory[key] = (byCategory[key] ?? 0) + 1; }
    const text = reader ? await reader(db, userId) : (record) => `${record.title}\n${record.bodyMd}\n${JSON.stringify(record.properties)}`;
    const joined = active.map((record) => text(record)).join("\n");
    const matchTotals = {};
    if (active.length >= 3) for (const posting of postings) {
      const match = calculateExplainableMatch(posting.id, posting.requirements, joined, new Date(0));
      if (match) matchTotals[posting.id] = match.total;
    }
    users[userId] = {
      records: records.length, activeRecords: active.length, recordsByCategory: Object.fromEntries(Object.entries(byCategory).sort()),
      views: await db.collection("career_views").countDocuments({ userId }),
      relations: await db.collection("career_record_relations").countDocuments({ userId }),
      links: await db.collection("record_links").countDocuments({ userId }),
      matchTotals,
    };
  }
  console.log(JSON.stringify({ database: values.db, phase: values.phase, postings: postings.length, users }, null, 2));
} finally {
  await client.close();
}
