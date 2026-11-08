import { randomUUID } from "node:crypto";

import { mongoCollections } from "@expresso/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createMongoFixture } from "../../../test/support/mongodb.js";
import { CareerDocumentService } from "../career-editor/index.js";
import { MongoIdentityService } from "../identity/index.js";
import { SchedulingService } from "../scheduling/service.js";
import { CareerService } from "./service.js";

/** 2026-11-02 감사 H10: 30일 정리는 정리 절차를 거쳐, 인용 중인 기록은 남기고 딸린 데이터도 지웁니다. */
describe.skipIf(!(process.env.TEST_MONGODB_ADMIN_URL ?? process.env.TEST_MONGODB_URL))("career trash retention", () => {
  let fixture: Awaited<ReturnType<typeof createMongoFixture>>;
  let career: CareerService; let documents: CareerDocumentService; let userId: string; let categoryId: string;

  beforeAll(async () => {
    fixture = await createMongoFixture("trashretention");
    career = new CareerService(fixture.resource);
    documents = new CareerDocumentService(fixture.resource, "retention-secret");
    userId = (await new MongoIdentityService(fixture.resource).signup({ email: `retention-${randomUUID()}@example.com`, password: "correct-horse-battery", displayName: "정리" })).user.id;
    categoryId = (await career.createCategory(userId, { key: `trash_${randomUUID().replaceAll("-", "")}`, name: "휴지통", icon: "folder", defaultView: "table" })).id;
  }, 60_000);

  afterAll(async () => { await fixture?.dispose(); });

  it("purges expired trashed records with their document data and keeps quoted ones", async () => {
    const db = mongoCollections(fixture.resource.db);
    const plain = (await career.createRecord(userId, randomUUID(), { categoryId, title: "지울 기록", properties: {}, bodyMd: "본문" })).record.id;
    const quoted = (await career.createRecord(userId, randomUUID(), { categoryId, title: "인용 중", properties: {}, bodyMd: "본문" })).record.id;
    await documents.bootstrap(userId, plain);
    await db.recordUsages.insertOne({ _id: randomUUID(), userId, recordId: quoted, blockId: randomUUID(), quotedText: "본문", firstUsedAt: new Date() });
    await career.trashRecord(userId, plain); await career.trashRecord(userId, quoted);
    const past = new Date(Date.now() - 1_000);
    await db.careerRecords.updateMany({ _id: { $in: [plain, quoted] } }, { $set: { purgeAfter: past } });

    const runId = randomUUID(); const at = new Date();
    await db.scheduledJobRuns.insertOne({ _id: runId, jobKey: "retention", scheduledFor: at, status: "queued", attempts: 0, createdAt: at } as never);
    const run = await new SchedulingService(fixture.resource).process(runId, at);
    expect(run.result).toMatchObject({ records: 1, skippedRecords: 1 });
    expect(await db.careerRecords.findOne({ _id: plain })).toBeNull();
    expect(await db.careerDocumentSnapshots.countDocuments({ recordId: plain })).toBe(0);
    expect(await db.careerRecords.findOne({ _id: quoted })).toBeTruthy();
  }, 60_000);
});
