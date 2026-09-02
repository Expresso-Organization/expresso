import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { MongoClient } from "mongodb";
import { markdownToCareerDocument, careerDocumentToMarkdown } from "../../packages/editor/dist/index.js";
import { migrateMongo } from "../../packages/database/dist/index.js";
import { backfillCareerDocuments, normalizeMarkdown } from "./backfill-career-documents.mjs";

test("fixed corpus round-trips supported Markdown", () => {
  const corpus = [
    "",
    "한국어 기록",
    "| 기술 | 결과 |\n| --- | --- |\n| TypeScript | 빠른 배포 |",
    "- 하나\n- 둘\n\n1. 첫째\n2. 둘째",
    "```ts\nconst answer = 42;\n```",
    "> [evidence:project] 검증된 결과",
    "![화면](media:media-1)\n\n[자료](file:file-1)",
  ];
  for (const source of corpus) {
    const document = markdownToCareerDocument(source);
    assert.equal(normalizeMarkdown(careerDocumentToMarkdown(document)), normalizeMarkdown(source));
  }
});

test("unsupported HTML is reported by round-trip comparison", () => {
  const source = "<video src=\"movie.mp4\"></video>";
  const document = markdownToCareerDocument(source);
  assert.notEqual(normalizeMarkdown(careerDocumentToMarkdown(document)), normalizeMarkdown(source));
});

test("CRLF normalization is stable", () => {
  assert.equal(normalizeMarkdown("a\r\nb\r"), "a\nb\n");
});

test("Mongo fixture dry-run/apply is idempotent", { skip: !process.env.TEST_MONGODB_ADMIN_URL }, async () => {
  const databaseName = `expresso_test_backfill_${randomUUID().replaceAll("-", "")}`;
  await migrateMongo({ databaseUrl: process.env.TEST_MONGODB_ADMIN_URL, databaseName });
  const client = new MongoClient(process.env.TEST_MONGODB_ADMIN_URL);
  await client.connect();
  const db = client.db(databaseName);
  const records = db.collection("career_records");
  const snapshots = db.collection("career_document_snapshots");
  const userId = randomUUID();
  const supportedId = randomUUID();
  const mismatchId = randomUUID();
  const migratedId = randomUUID();
  const categoryId = (await db.collection("career_categories").findOne({ isSystem: true }))._id;
  const record = (id, bodyMd) => ({
    _id: id, userId, categoryId, title: "기록", status: "draft", origin: "manual",
    properties: {}, bodyMd, version: 1, updatedAt: new Date(), deletedAt: null,
  });
  await records.insertMany([
    record(supportedId, "# 한국어 기록"),
    record(mismatchId, "<video src=\"x\"></video>"),
    { ...record(migratedId, "이미 있음"), documentVersion: 0 },
  ]);
  try {
    const dry = await backfillCareerDocuments({ client, databaseName: db.databaseName, mode: "dry-run", batchSize: 2 });
    assert.equal(dry.mismatches.length, 1);
    assert.equal(dry.writes, 0);
    const first = await backfillCareerDocuments({ client, databaseName: db.databaseName, mode: "apply", batchSize: 2 });
    assert.equal(first.writes, 1);
    const second = await backfillCareerDocuments({ client, databaseName: db.databaseName, mode: "apply", batchSize: 2 });
    assert.equal(second.writes, 0);
    assert.equal((await records.countDocuments({ _id: { $in: [supportedId, mismatchId, migratedId] } })), 3);
    assert.equal((await snapshots.countDocuments({ recordId: supportedId })), 1);
    assert.equal((await snapshots.countDocuments({ recordId: mismatchId })), 0);
    assert.equal((await records.findOne({ _id: mismatchId })).bodyMd, "<video src=\"x\"></video>");
  } finally {
    await db.dropDatabase();
    await client.close();
  }
});
