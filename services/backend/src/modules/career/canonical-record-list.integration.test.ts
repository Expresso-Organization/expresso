import { createHash, randomUUID } from "node:crypto";
import { Binary, Decimal128 } from "mongodb";
import { createEmptyCareerDocument, encodeDocumentAsYUpdate, encodeDocumentStateVector } from "@expresso/editor";
import type { CareerPropertyDefinitionV2, ListCareerRecordsQuery } from "@expresso/contracts";
import { mongoCollections, type CareerRecordDoc } from "@expresso/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMongoFixture } from "../../../test/support/mongodb.js";
import { MongoIdentityService } from "../identity/index.js";
import { CanonicalCareerReadService } from "./canonical-reads.js";
import { listCanonicalCareerRecords } from "./canonical-record-list.js";
import { mutationCanonicalJson, mutationFingerprint } from "./property-mutation-state.js";

const amount: CareerPropertyDefinitionV2 = { id: randomUUID(), key: "amount", name: "Amount", type: "number", required: false, system: false, config: {}, order: 0, version: 1, deletedAt: null };
const period: CareerPropertyDefinitionV2 = { ...amount, id: randomUUID(), key: "period", name: "Period", type: "date", order: 1 };
const related: CareerPropertyDefinitionV2 = { ...amount, id: randomUUID(), key: "related", name: "Related", type: "relation", order: 2 };

describe.skipIf(!(process.env.TEST_MONGODB_ADMIN_URL ?? process.env.TEST_MONGODB_URL))("canonical Career record list with Mongo", () => {
  let fixture: Awaited<ReturnType<typeof createMongoFixture>>;
  let reader: CanonicalCareerReadService;
  let userId: string;
  let otherUserId: string;
  let categoryId: string;
  let foreignId: string;
  let trashedId: string;
  let rows: CareerRecordDoc[];
  const now = new Date("2026-09-01T00:00:00Z");
  const ids = Array.from({ length: 6 }, () => randomUUID()).sort();

  function row(id: string, overrides: Partial<CareerRecordDoc> = {}): CareerRecordDoc {
    return { _id: id, userId, categoryId, title: "Title only", status: "draft", origin: "manual", properties: { amount: 999, period: "2030-01" }, propertyValues: [], bodyMd: "", periodStart: "2030-01-01", periodEnd: "2031-01-01", version: 1, createdAt: now, updatedAt: now, deletedAt: null, ...overrides };
  }
  async function snapshot(recordId: string, text: string, documentVersion = 1, actorId = userId) {
    const document = createEmptyCareerDocument();
    document.content[0]!.text = text ? [{ text }] : [];
    const bytes = encodeDocumentAsYUpdate(document);
    await mongoCollections(fixture.resource.db).careerDocumentSnapshots.insertOne({ _id: randomUUID(), userId: actorId, recordId, documentVersion, schemaVersion: 1, content: JSON.parse(JSON.stringify(document)), stateVector: new Binary(encodeDocumentStateVector(document)), serverSequence: 0, checksum: createHash("sha256").update(bytes).digest("hex"), actor: "user", createdAt: now });
    return document;
  }
  function query(overrides: Partial<ListCareerRecordsQuery> = {}, actorId = userId) {
    return listCanonicalCareerRecords(reader, actorId, { sort: "updated_desc", limit: 50, categoryId, ...overrides });
  }
  beforeAll(async () => {
    fixture = await createMongoFixture("b2canonicallist");
    reader = new CanonicalCareerReadService(fixture.resource);
    const identity = new MongoIdentityService(fixture.resource);
    userId = (await identity.signup({ email: "list-a-" + randomUUID() + "@example.com", displayName: "A", password: "disposable-list-password" })).user.id;
    otherUserId = (await identity.signup({ email: "list-b-" + randomUUID() + "@example.com", displayName: "B", password: "disposable-list-password" })).user.id;
    const db = mongoCollections(fixture.resource.db);
    categoryId = randomUUID();
    const foreignCategoryId = randomUUID();
    const category = { _id: categoryId, userId, key: "b2-list", name: "Canonical list", icon: "table", defaultView: "table" as const, isSystem: false, propertySchema: {}, propertySchemaV2: [amount, period, { ...related, config: { targetCategoryId: categoryId, cardinality: "multiple", deletePolicy: "restrict" } }], schemaVersion: 1, version: 1, sortOrder: 0, updatedAt: now };
    await db.careerCategories.insertMany([category, { ...category, _id: foreignCategoryId, userId: otherUserId, key: "foreign-list" }]);
    // Spring 소유의 정본 상태를 직접 seed하고 물리 legacy 값은 다르게 둡니다.
    rows = [
      row(ids[0]!, { title: "Equal", propertyValues: [{ propertyDefinitionId: amount.id, type: "number", value: Decimal128.fromString("123.4500") }, { propertyDefinitionId: period.id, type: "date", value: { precision: "month", start: "2026-09", end: "2026-10" } }], bodyMd: "Stale document" }),
      row(ids[1]!, { title: "Equal", status: "organized", origin: "interview", propertyValues: [{ propertyDefinitionId: period.id, type: "date", value: { precision: "day", start: "2026-09-02", end: null } }] }),
      row(ids[2]!, { title: "Empty document", status: "verified", origin: "ai", bodyMd: "Stale document" }),
      row(ids[3]!, { title: "Nonempty document" }),
      row(ids[4]!, { title: "Relation only", status: "organized" }),
      row(ids[5]!),
    ];
    foreignId = randomUUID();
    trashedId = randomUUID();
    await db.careerRecords.insertMany([...rows, row(foreignId, { userId: otherUserId }), row(trashedId, { deletedAt: now }), row(randomUUID(), { categoryId: foreignCategoryId })]);
    await snapshot(ids[0]!, "Latest owner document");
    await snapshot(ids[2]!, "Old content", 1);
    await snapshot(ids[2]!, "", 2);
    const base = await snapshot(ids[3]!, "");
    const latest = { ...base, content: [{ ...base.content[0]!, text: [{ text: "Live update content" }] }] };
    const update = encodeDocumentAsYUpdate(latest, [encodeDocumentAsYUpdate(base)], randomUUID());
    await db.careerDocumentUpdates.insertOne({ _id: randomUUID(), recordId: ids[3]!, userId, clientId: randomUUID(), clientSequence: 1, serverSequence: 1, update: new Binary(update), byteLength: update.byteLength, updateHash: createHash("sha256").update(update).digest("hex"), actor: "user", receivedAt: now, compactedAt: null });
    await snapshot(ids[3]!, "Foreign snapshot", 99, otherUserId);
    await db.careerRecordRelations.insertOne({ _id: randomUUID(), userId, sourceRecordId: ids[4]!, sourcePropertyId: related.id, targetRecordId: ids[1]!, cardinality: "multiple", deletePolicy: "restrict", createdBy: "user", createdAt: now, updatedAt: now });
    await db.recordLinks.insertMany([
      { _id: randomUUID(), userId, fromRecordId: ids[0]!, toRecordId: ids[1]!, relation: "related", createdBy: "user" },
      { _id: randomUUID(), userId, fromRecordId: ids[3]!, toRecordId: ids[0]!, relation: "related", createdBy: "user" },
      ...[foreignId, trashedId, randomUUID()].map((toRecordId) => ({ _id: randomUUID(), userId, fromRecordId: ids[0]!, toRecordId, relation: "related" as const, createdBy: "user" as const })),
      { _id: randomUUID(), userId: otherUserId, fromRecordId: ids[0]!, toRecordId: ids[1]!, relation: "related", createdBy: "user" },
    ]);
    const portfolios = [randomUUID(), randomUUID(), randomUUID()];
    await db.portfolios.insertMany(portfolios.map((id, index) => ({ _id: id, userId: index === 2 ? otherUserId : userId, brewId: randomUUID(), templateId: randomUUID(), title: "Usage", status: "draft" as const, createdAt: now, updatedAt: now, styleOverrides: {} })));
    const sections = Array.from({ length: 5 }, () => randomUUID());
    await db.portfolioSections.insertMany(sections.map((id, index) => ({ _id: id, userId: index === 3 ? otherUserId : userId, portfolioId: portfolios[index === 4 ? 2 : index === 2 ? 1 : 0]!, orderNo: index, visible: true })));
    const blocks = Array.from({ length: 7 }, () => randomUUID());
    await db.blocks.insertMany(blocks.slice(0, 6).map((id, index) => ({ _id: id, userId: index === 5 ? otherUserId : userId, portfolioSectionId: sections[index === 5 ? 0 : index]!, kind: "paragraph" as const, content: {}, style: {}, syncState: "synced" as const, locked: false, orderNo: index })));
    await db.recordUsages.insertMany(blocks.map((blockId) => ({ _id: randomUUID(), userId, recordId: ids[0]!, blockId, quotedText: "quote", firstUsedAt: now })));
    await db.recordUsages.insertOne({ _id: randomUUID(), userId: otherUserId, recordId: ids[0]!, blockId: blocks[2]!, quotedText: "foreign", firstUsedAt: now });
  }, 60_000);
  afterAll(async () => { await fixture?.dispose(); });

  it("projects exact canonical values, latest owner documents, scoped counts and true empty summaries without writes", async () => {
    const db = mongoCollections(fixture.resource.db);
    const before = await db.careerRecords.findOne({ _id: ids[0]! });
    const result = await query();
    expect(result.summary).toEqual({ total: 6, draft: 3, organized: 2, verified: 1, empty: 2 });
    const first = result.data.find((item) => item.id === ids[0])!;
    expect(first).toMatchObject({ properties: { amount: "123.4500", period: "2026-09" }, bodyMd: "Latest owner document", periodFrom: "2026-09-01", periodTo: "2026-10-01", linkCount: 2, usedInCount: 2 });
    expect(first.propertyValues).toContainEqual({ propertyDefinitionId: period.id, type: "date", value: { precision: "month", start: "2026-09", end: "2026-10" } });
    expect(result.data.find((item) => item.id === ids[2])).toMatchObject({ bodyMd: "", isEmpty: true, periodFrom: null, periodTo: null });
    expect(result.data.find((item) => item.id === ids[3])).toMatchObject({ bodyMd: "Live update content", isEmpty: false });
    expect(result.data.find((item) => item.id === ids[4])).toMatchObject({ isEmpty: false });
    expect(result.data.find((item) => item.id === ids[5])).toMatchObject({ isEmpty: true });
    expect(await db.careerRecords.findOne({ _id: ids[0]! })).toEqual(before);
    await expect(query({}, otherUserId)).rejects.toMatchObject({ statusCode: 404 });
    expect((await query({ categoryId: undefined })).data.map((item) => item.id).sort()).toEqual(ids);
  });
  it("applies literal search, status and origin to both page and complete summary", async () => {
    expect((await query({ q: "Equal", status: "organized", origin: "interview" })).summary).toEqual({ total: 1, draft: 0, organized: 1, verified: 0, empty: 0 });
    expect((await query({ q: ".*" })).summary.total).toBe(0);
  });
  it.each(["updated_asc", "updated_desc", "title_asc", "period_asc", "period_desc"] as const)("pages %s with stable ID ties and canonical periods", async (sort) => {
    const expected = sort === "updated_asc" ? ids : sort === "updated_desc" ? [...ids].reverse()
      : sort === "title_asc" ? [ids[2], ids[0], ids[1], ids[3], ids[4], ids[5]]
      : sort === "period_asc" ? ids : [ids[1], ids[0], ...ids.slice(2).reverse()];
    let cursor: string | undefined;
    const actual: string[] = [];
    do {
      const page = await query({ sort, limit: 2, ...(cursor ? { cursor } : {}) });
      actual.push(...page.data.map((item) => item.id));
      expect(page.summary.total).toBe(6);
      cursor = page.page.nextCursor ?? undefined;
    } while (cursor);
    expect(actual).toEqual(expected);
  });
  it("does not cap true empty summaries at the requested page size or a hidden candidate limit", async () => {
    const db = mongoCollections(fixture.resource.db);
    const extras = Array.from({ length: 111 }, () => row(randomUUID()));
    await db.careerRecords.insertMany(extras);
    try { expect((await query({ limit: 1 })).summary).toEqual({ total: 117, draft: 114, organized: 2, verified: 1, empty: 113 }); }
    finally { await db.careerRecords.deleteMany({ _id: { $in: extras.map((item) => item._id) } }); }
  });
  it("rejects unprepared canonical records before filters can hide them", async () => {
    const db = mongoCollections(fixture.resource.db);
    const invalid = row(randomUUID());
    delete invalid.propertyValues;
    await db.careerRecords.insertOne(invalid);
    try { await expect(query({ q: "missing search" })).rejects.toMatchObject({ statusCode: 409 }); }
    finally { await db.careerRecords.deleteOne({ _id: invalid._id }); }
  });
  it("orders offset datetimes by exact nanoseconds and preserves local period bounds", async () => {
    const db = mongoCollections(fixture.resource.db);
    const extra = [
      row(randomUUID(), { title: "Timed later", propertyValues: [{ propertyDefinitionId: period.id, type: "date", value: { precision: "datetime", start: "2026-09-03T00:00:00.000000002+09:00", end: "2026-09-04T00:00:00.000000002+09:00", timezone: "Asia/Seoul" } }] }),
      row(randomUUID(), { title: "Timed earlier", propertyValues: [{ propertyDefinitionId: period.id, type: "date", value: { precision: "datetime", start: "2026-09-02T15:00:00.000000001Z", end: null, timezone: "UTC" } }] }),
    ];
    await db.careerRecords.insertMany(extra);
    try {
      const first = await query({ sort: "period_asc", q: "Timed", limit: 1 });
      expect(first.data[0]?.id).toBe(extra[1]!._id);
      const next = await query({ sort: "period_asc", q: "Timed", limit: 1, cursor: first.page.nextCursor! });
      expect(next.data[0]).toMatchObject({ id: extra[0]!._id, periodFrom: "2026-09-03", periodTo: "2026-09-04" });
      expect(next.data[0]?.propertyValues).toEqual(extra[0]!.propertyValues);
    } finally { await db.careerRecords.deleteMany({ _id: { $in: extra.map(item => item._id) } }); }
  });
  it.each(["conversion", "deletion"] as const)("preserves a pending %s source period and counts its values as nonempty", async kind => {
    const db = mongoCollections(fixture.resource.db);
    const category = await db.careerCategories.findOne({ _id: categoryId });
    const target: CareerPropertyDefinitionV2 = kind === "conversion" ? { ...period, type: "text", version: 2 } : { ...period, deletedAt: now.toISOString(), version: 2 };
    const definitions = category!.propertySchemaV2!.map(item => item.id === period.id ? target : item);
    const plan = { userId, categoryId, categoryVersion: 2, schemaVersion: 2, definitions, recordIds: ids, operation: { kind, source: period, target, defaultValue: null, confirmLossy: true } };
    const jobId = randomUUID();
    await db.careerCategories.updateOne({ _id: categoryId }, { $set: { propertySchemaV2: definitions, schemaVersion: 2, version: 2 } });
    await db.careerPropertyMutations.insertOne({ _id: jobId, userId, categoryId, propertyId: period.id, planJson: mutationCanonicalJson(plan), operationFingerprint: mutationFingerprint(plan), status: "running", active: true, cursor: 0, processedCount: 0, skippedCount: 0, attempts: 1, leaseToken: null, leaseUntil: null, lastError: null, commitFence: 1, createdAt: now, updatedAt: now, completedAt: null });
    try {
      const page = await query({ sort: "period_asc", limit: 2 });
      expect(page.data.map(item => item.id)).toEqual(ids.slice(0, 2));
      expect(page.data[0]).toMatchObject({ periodFrom: "2026-09-01", isEmpty: false, pendingPropertyMutation: { jobId, status: "running", sourceProperty: period } });
      expect(page.summary.empty).toBe(2);
    } finally {
      await db.careerPropertyMutations.deleteOne({ _id: jobId });
      await db.careerCategories.updateOne({ _id: categoryId }, { $set: { propertySchemaV2: category!.propertySchemaV2!, schemaVersion: category!.schemaVersion!, version: category!.version } });
    }
  });
  it("binds cursor replay to the actor and query", async () => {
    const page = await query({ limit: 1 });
    await expect(query({ cursor: page.page.nextCursor!, status: "draft" })).rejects.toMatchObject({ statusCode: 400 });
    await expect(query({ cursor: page.page.nextCursor!, categoryId: undefined }, otherUserId)).rejects.toMatchObject({ statusCode: 400 });
  });
  it("pages full 300-codepoint Unicode titles within the cursor contract and resolves an unchanged soft-deleted anchor", async () => {
    const db = mongoCollections(fixture.resource.db);
    const extra = [row(randomUUID(), { title: "😀".repeat(300) }), row(randomUUID(), { title: "😁".repeat(300) })];
    await db.careerRecords.insertMany(extra);
    try {
      const first = await query({ sort: "title_asc", q: "😀", limit: 1 });
      expect(first.data[0]?.title).toBe(extra[0]!.title);
      // 300 codepoint 제목의 두 행으로 keyset을 검증합니다.
      const all = await query({ sort: "title_asc", limit: 7 });
      expect(all.data.at(-1)?.id).toBe(extra[0]!._id);
      expect(all.page.nextCursor?.length).toBeLessThanOrEqual(512);
      await db.careerRecords.updateOne({ _id: extra[0]!._id }, { $set: { deletedAt: now } });
      const next = await query({ sort: "title_asc", limit: 7, cursor: all.page.nextCursor! });
      expect(next.data.map((item) => item.id)).toEqual([extra[1]!._id]);
    } finally { await db.careerRecords.deleteMany({ _id: { $in: extra.map((item) => item._id) } }); }
  });
  it("requires resetting a long-title cursor after its anchor is edited or purged", async () => {
    const db = mongoCollections(fixture.resource.db);
    const extra = [row(randomUUID(), { title: "😀".repeat(300) }), row(randomUUID(), { title: "😁".repeat(300) })];
    await db.careerRecords.insertMany(extra);
    try {
      const page = await query({ sort: "title_asc", limit: 7 });
      await db.careerRecords.updateOne({ _id: extra[0]!._id }, { $set: { title: "Changed", updatedAt: new Date(now.getTime() + 1) }, $inc: { version: 1 } });
      await expect(query({ sort: "title_asc", limit: 7, cursor: page.page.nextCursor! })).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining("reset") });
      await db.careerRecords.deleteOne({ _id: extra[0]!._id });
      await expect(query({ sort: "title_asc", limit: 7, cursor: page.page.nextCursor! })).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining("reset") });
    } finally { await db.careerRecords.deleteMany({ _id: { $in: extra.map((item) => item._id) } }); }
  });
});