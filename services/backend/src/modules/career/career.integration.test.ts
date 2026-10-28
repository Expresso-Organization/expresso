import { createHash, randomUUID } from "node:crypto";
import { careerDocumentToBlockNote } from "@expresso/editor/blocknote";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApi } from "../../api/build-app.js";
import type { RuntimeConfig } from "../../config/runtime-config.js";
import { CareerError } from "./errors.js";
import type { CareerApi } from "./index.js";
import { MongoCareerService } from "./service.js";
import { MongoIdentityService, type IdentityApi } from "../identity/index.js";
import { mongoCollections } from "@expresso/database";
import { createMongoFixture } from "../../../test/support/mongodb.js";
import { assertActiveRecordsForWrite, purgeTrashedCareerRecord } from "./mongo-record-guard.js";
import { inTransaction } from "../../platform/mongo-transaction.js";
import { CareerDocumentService, syncBlockNoteDocument } from "../career-editor/index.js";

const DEFAULT_CATEGORY_KEYS = [
  "experience",
  "project",
  "education_history",
  "certification_award",
  "academic_writing",
  "activity_leadership",
  "skill_tool",
];

describe.skipIf(!process.env.TEST_MONGODB_URL)("MongoDB career editing", () => {
  let fixture: Awaited<ReturnType<typeof createMongoFixture>>;
  let service: MongoCareerService;
  let userId: string;
  let otherId: string;
  let categoryId: string;
  beforeAll(async () => {
    fixture = await createMongoFixture("career-editing");
    service = new MongoCareerService(fixture.resource);
    const identity = new MongoIdentityService(fixture.resource);
    userId = (await identity.signup({ email: `career-${randomUUID()}@example.com`, password: "correct-horse-battery", displayName: "기록" })).user.id;
    otherId = (await identity.signup({ email: `career-${randomUUID()}@example.com`, password: "correct-horse-battery", displayName: "다른 사용자" })).user.id;
    categoryId = (await service.listCategories(userId)).find((category) => category.key === "experience")!.id;
  }, 60_000);
  afterAll(async () => { await fixture?.dispose(); });

  it("scopes categories, validates properties, and replays only identical create requests", async () => {
    const owned = await service.listCategories(userId);
    const others = await service.listCategories(otherId);
    expect(owned.map((category) => category.key)).toEqual(DEFAULT_CATEGORY_KEYS);
    expect(others.map((category) => category.key)).toEqual(DEFAULT_CATEGORY_KEYS);
    // 같은 키라도 사용자마다 다른 카테고리다. 남의 카테고리에는 기록을 만들 수 없다.
    expect(others.find((category) => category.key === "experience")!.id).not.toBe(categoryId);
    await expect(service.createRecord(otherId, randomUUID(), { categoryId, title: "", properties: {}, bodyMd: "" })).rejects.toMatchObject({ statusCode: 404 });
    const input = { categoryId, title: "한국어 日本語 😀", properties: {}, bodyMd: "가".repeat(200_000) };
    const key = randomUUID();
    const created = await service.createRecord(userId, key, input);
    expect(created.created).toBe(true);
    expect(await service.createRecord(userId, key, input)).toEqual({ ...created, created: false });
    await expect(service.createRecord(userId, key, { ...input, title: "변경" })).rejects.toMatchObject({ statusCode: 409 });
    await expect(service.getRecord(otherId, created.record.id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.createRecord(userId, randomUUID(), { ...input, bodyMd: "a".repeat(200_001) })).rejects.toThrow();
    await expect(service.createRecord(userId, randomUUID(), { ...input, properties: { role: null } as never })).rejects.toThrow();
  });

  it("allows exactly one concurrent update at the same version", async () => {
    const { record } = await service.createRecord(userId, randomUUID(), { categoryId, title: "초기", properties: {}, bodyMd: "" });
    const results = await Promise.allSettled(["A", "B"].map((title) => service.updateRecord(userId, record.id, record.version, { title })));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({ reason: { statusCode: 412 } });
    expect((await service.getRecord(userId, record.id)).version).toBe(2);
    await expect(service.updateRecord(otherId, record.id, 2, { title: "침입" })).rejects.toMatchObject({ statusCode: 404 });
  });

  it("projects BlockNote documents to bodyMd and syncs the document after a legacy overwrite", async () => {
    const { record } = await service.createRecord(userId, randomUUID(), {
      categoryId,
      title: "호환",
      properties: {},
      bodyMd: "# 초기",
    });
    const legacySaved = await service.updateRecord(userId, record.id, record.version, { bodyMd: "# 레거시 저장" });
    expect(legacySaved.bodyMd).toBe("# 레거시 저장");
    const collections = mongoCollections(fixture.resource.db);
    expect(await collections.careerDocumentSnapshots.countDocuments({ recordId: record.id })).toBe(1);
    expect(await collections.careerRecordRevisions.countDocuments({ recordId: record.id, summary: "레거시 본문 저장" })).toBe(1);

    const documentService = new CareerDocumentService(fixture.resource, "legacy-compatibility-secret");
    const bootstrap = await documentService.bootstrap(userId, record.id);
    expect(bootstrap.editor).toBe("blocknote");
    // 브라우저 편집기가 보내는 것과 같은 BlockNote 업데이트로 제목 문장을 고칩니다.
    const next = structuredClone(bootstrap.document);
    next.content[0]!.text = [{ text: "Yjs 변경" }];
    const update = syncBlockNoteDocument(Buffer.from(bootstrap.stateBase64!, "base64"), [], careerDocumentToBlockNote(next).blocks).update;
    await documentService.appendUpdate(userId, {
      recordId: record.id,
      clientId: randomUUID(),
      clientSequence: 1,
      expectedSequence: bootstrap.documentVersion,
      updateBase64: Buffer.from(update).toString("base64"),
      checksum: createHash("sha256").update(update).digest("hex"),
    });
    await documentService.projectBodyMarkdown(userId, record.id);
    const projected = await service.getRecord(userId, record.id);
    expect(projected.bodyMd).toContain("Yjs 변경");

    // 편집기 밖의 bodyMd 쓰기는 막지 않고, 다음 bootstrap이 문서를 그 내용으로 맞춥니다.
    await service.updateRecord(userId, record.id, projected.version, { bodyMd: "# 덮어쓰기" });
    const synced = await documentService.bootstrap(userId, record.id);
    expect(synced.document.content[0]?.text?.[0]?.text).toBe("덮어쓰기");
    expect(await collections.careerDocumentUpdates.countDocuments({ recordId: record.id, actor: "migration" })).toBe(1);
  });

  it("canonicalizes links, checks source spans, and replaces skill evidence atomically", async () => {
    const make = () => service.createRecord(userId, randomUUID(), { categoryId, title: "Kubernetes", properties: {}, bodyMd: "" });
    const a = (await make()).record;
    const b = (await make()).record;
    expect(await service.createLink(userId, a.id, b.id, "related")).toEqual(await service.createLink(userId, b.id, a.id, "related"));
    expect(await service.listLinks(userId, a.id)).toHaveLength(1);
    await expect(service.createLink(otherId, a.id, b.id, "parent")).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.createLink(userId, a.id, a.id, "related")).rejects.toMatchObject({ statusCode: 400 });
    const evidence = (recordId: string) => ({ recordId, span: { source: "title" as const, start: 0, end: 10, quote: "Kubernetes" } });
    const skill = await service.recomputeSkill(userId, { name: "K8s", evidence: [evidence(a.id), evidence(b.id)] });
    expect(skill).toMatchObject({ name: "kubernetes", level: 2, strength: "supported", evidenceCount: 2 });
    await expect(service.recomputeSkill(userId, { name: "K8s", evidence: [{ ...evidence(a.id), span: { ...evidence(a.id).span, quote: "invented" } }] })).rejects.toMatchObject({ statusCode: 400 });
    expect(await service.listSkillEvidence(userId, skill.id)).toHaveLength(2);
    await service.recomputeSkill(userId, { name: "K8s", evidence: [evidence(b.id)] });
    expect(await service.listSkillEvidence(userId, skill.id)).toEqual([{ recordId: b.id, recordTitle: "Kubernetes", span: evidence(b.id).span }]);
    expect((await service.getRecord(userId, a.id)).version).toBe(1);
    await expect(service.listSkillEvidence(otherId, skill.id)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("keeps quoted snapshots through trash, but refuses physical purge while cited", async () => {
    const record = (await service.createRecord(userId, randomUUID(), { categoryId, title: "보존", properties: {}, bodyMd: "본문" })).record;
    const db = mongoCollections(fixture.resource.db);
    const blockId = randomUUID();
    const sectionId = randomUUID();
    await db.portfolioSections.insertOne({ _id: sectionId, userId, portfolioId: randomUUID(), orderNo: 0, visible: true });
    await db.blocks.insertOne({ _id: blockId, userId, portfolioSectionId: sectionId, kind: "paragraph", content: { text: "보존 문장" }, style: {}, sourceRecordId: record.id, syncState: "synced", locked: false, orderNo: 0 });
    await db.recordUsages.insertOne({ _id: randomUUID(), userId, recordId: record.id, blockId, quotedText: "본문", firstUsedAt: new Date() });
    expect((await service.listRecords(userId, { q: "보존", sort: "updated_desc", limit: 10 })).data[0]?.usedInCount).toBe(1);
    const at = new Date("2026-08-01T00:00:00Z");
    expect(await service.trashRecord(userId, record.id, at)).toMatchObject({ portfolioCount: 1, blockCount: 1, purgeAfter: "2026-08-31T00:00:00.000Z" });
    await expect(purgeTrashedCareerRecord(fixture.resource, userId, record.id, new Date("2026-08-31T00:00:00Z"))).rejects.toMatchObject({ statusCode: 409 });
    await expect(service.restoreRecord(userId, record.id, new Date("2026-08-31T00:00:00Z"))).rejects.toMatchObject({ statusCode: 404 });
    await service.restoreRecord(userId, record.id, new Date("2026-08-30T23:59:59Z"));
    await service.trashRecord(userId, record.id, at);
    await db.recordUsages.deleteMany({ userId, recordId: record.id });
    await purgeTrashedCareerRecord(fixture.resource, userId, record.id, new Date("2026-08-31T00:00:00Z"));
    expect(await db.blocks.findOne({ _id: blockId })).toMatchObject({ content: { text: "보존 문장" }, sourceRecordId: null, syncState: "detached" });
    expect(await db.careerRecords.findOne({ _id: record.id })).toBeNull();
  });

  it("retries a stale reference transaction and refuses a newly trashed record", async () => {
    const record = (await service.createRecord(userId, randomUUID(), { categoryId, title: "경쟁", properties: {}, bodyMd: "" })).record;
    let release!: () => void;
    let started!: () => void;
    const barrier = new Promise<void>((resolve) => { release = resolve; });
    const snapshot = new Promise<void>((resolve) => { started = resolve; });
    let attempts = 0;
    const referencing = inTransaction(fixture.resource, async (tx) => {
      await mongoCollections(tx.db).careerRecords.findOne({ _id: record.id }, { session: tx.session });
      if (++attempts === 1) { started(); await barrier; }
      await assertActiveRecordsForWrite(tx, userId, [record.id, record.id]);
      await mongoCollections(tx.db).recordUsages.insertOne({ _id: randomUUID(), userId, recordId: record.id, blockId: randomUUID(), quotedText: "", firstUsedAt: new Date() }, { session: tx.session });
    });
    const rejected = expect(referencing).rejects.toMatchObject({ statusCode: 404 });
    await snapshot;
    try { await service.trashRecord(userId, record.id); } finally { release(); }
    await rejected;
    expect(attempts).toBeGreaterThan(1);
    expect(await mongoCollections(fixture.resource.db).recordUsages.countDocuments({ recordId: record.id })).toBe(0);
  });

  it("stores profile atomically on the owner and blocks writes after deletion starts", async () => {
    expect(await service.getProfile(otherId)).toBeNull();
    await service.saveProfile(otherId, { targetRoles: ["백엔드", "백엔드"], experienceYears: 3, primaryGoal: "build" });
    expect(await service.getProfile(otherId)).toMatchObject({ targetRoles: ["백엔드"], experienceYears: 3 });
    await mongoCollections(fixture.resource.db).users.updateOne({ _id: otherId }, { $set: { deletionRequestedAt: new Date() } });
    await expect(service.saveProfile(otherId, { targetRoles: [], experienceYears: 0, primaryGoal: "explore" })).rejects.toMatchObject({ statusCode: 401 });
    await expect(service.createRecord(otherId, randomUUID(), { categoryId, title: "", properties: {}, bodyMd: "" })).rejects.toMatchObject({ statusCode: 401 });
  });
});

const config: RuntimeConfig = {
  nodeEnv: "test",
  host: "127.0.0.1",
  port: 4_000,
  logLevel: "silent",
  redisUrl: "redis://127.0.0.1:1",
  outboxPollIntervalMs: 1_000,
  outboxBatchSize: 25,
  outboxMaxAttempts: 5,
  queuePrefix: "expresso-career-test",
};

describe.skipIf(!process.env.TEST_MONGODB_URL)("career domain integration", () => {
  let fixture: Awaited<ReturnType<typeof createMongoFixture>>;
  let identityService: IdentityApi;
  let careerService: CareerApi;
  let app: ReturnType<typeof buildApi>;
  let firstUserId: string;
  let secondUserId: string;
  let firstAccessToken: string;
  let secondAccessToken: string;
  let experienceCategoryId: string;

  const auth = (accessToken = firstAccessToken) => ({
    authorization: `Bearer ${accessToken}`,
  });

  beforeAll(async () => {
    fixture = await createMongoFixture("career-http");
    identityService = new MongoIdentityService(fixture.resource);
    careerService = new MongoCareerService(fixture.resource);
    const first = await identityService.signup({ email: `career-${randomUUID()}@example.com`, displayName: "기록 A", password: "correct-horse-battery" });
    const second = await identityService.signup({ email: `career-${randomUUID()}@example.com`, displayName: "기록 B", password: "correct-horse-battery" });
    firstUserId = first.user.id; secondUserId = second.user.id;
    firstAccessToken = first.session.accessToken; secondAccessToken = second.session.accessToken;
    experienceCategoryId = (await careerService.listCategories(firstUserId)).find((category) => category.key === "experience")!.id;
    app = buildApi({ config, identityService, careerService });
    await app.ready();
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await fixture?.dispose();
  });

  it("shows each user their own seven default categories idempotently", async () => {
    const first = await app.inject({
      method: "GET",
      url: "/v1/career/categories",
      headers: auth(),
    });
    const second = await app.inject({
      method: "GET",
      url: "/v1/career/categories",
      headers: auth(),
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().data.map(({ key }: { key: string }) => key)).toEqual(DEFAULT_CATEGORY_KEYS);
    expect(second.json().data.map(({ id }: { id: string }) => id)).toEqual(
      first.json().data.map(({ id }: { id: string }) => id),
    );
    expect(first.json().data[0].id).toBe(experienceCategoryId);

    // 다른 사용자는 같은 키의 카테고리를 자기 몫으로 따로 가진다.
    const other = await app.inject({
      method: "GET",
      url: "/v1/career/categories",
      headers: auth(secondAccessToken),
    });
    expect(other.statusCode).toBe(200);
    expect(other.json().data.map(({ key }: { key: string }) => key)).toEqual(DEFAULT_CATEGORY_KEYS);
    const firstIds = new Set(first.json().data.map(({ id }: { id: string }) => id));
    expect(other.json().data.some(({ id }: { id: string }) => firstIds.has(id))).toBe(false);
  });

  it("provides idempotent record CRUD, ETags, stale-save rejection, and user scope", async () => {
    const body = {
      categoryId: experienceCategoryId,
      title: "API platform migration",
      properties: { period: { type: "date", value: { start: "2024-01-01", end: "2024-06-30", timezone: null } } },
      bodyMd: "Migrated the API platform with zero downtime.",
    };
    const headers = { ...auth(), "idempotency-key": "career-record:retry-0001" };
    const created = await app.inject({ method: "POST", url: "/v1/career/records", headers, payload: body });
    const replayed = await app.inject({ method: "POST", url: "/v1/career/records", headers, payload: body });
    expect(created.statusCode).toBe(201);
    expect(replayed.statusCode).toBe(200);
    expect(replayed.json().data.id).toBe(created.json().data.id);
    const recordId = created.json().data.id as string;
    const count = await mongoCollections(fixture.resource.db).careerRecords.countDocuments({ userId: firstUserId, createIdempotencyKey: "career-record:retry-0001" });
    expect(count).toBe(1);

    const updated = await app.inject({
      method: "PATCH",
      url: `/v1/career/records/${recordId}`,
      headers: { ...auth(), "if-match": created.headers.etag as string },
      payload: { bodyMd: `${body.bodyMd}\nValidated rollback.` },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.headers.etag).toBe('"v2"');

    const stale = await app.inject({
      method: "PATCH",
      url: `/v1/career/records/${recordId}`,
      headers: { ...auth(), "if-match": '"v1"' },
      payload: { title: "Stale overwrite" },
    });
    expect(stale.statusCode).toBe(412);
    expect(stale.json().error.code).toBe("PRECONDITION_FAILED");

    const crossUser = await app.inject({
      method: "GET",
      url: `/v1/career/records/${recordId}`,
      headers: auth(secondAccessToken),
    });
    expect(crossUser.statusCode).toBe(404);
  });

  it("creates a category with v2 properties, validates typed values, and returns links bidirectionally", async () => {
    const postgresOption = { id: randomUUID(), name: "PostgreSQL" };
    const typescriptOption = { id: randomUUID(), name: "TypeScript" };
    const definition = (key: string, name: string, type: "number" | "multi_select" | "date", order: number, config: Record<string, unknown> = {}) =>
      ({ id: randomUUID(), key, name, type, required: false, system: false, config, order, version: 1, deletedAt: null });
    const categoryResponse = await app.inject({
      method: "POST",
      url: "/v1/career/categories",
      headers: auth(),
      payload: {
        key: `custom_${randomUUID().replaceAll("-", "").slice(0, 12)}`,
        name: "Custom projects",
        icon: "sparkles",
        defaultView: "gallery",
        propertySchemaV2: [
          definition("impact", "Impact", "number", 0),
          definition("tools", "Tools", "multi_select", 1, { options: [postgresOption, typescriptOption] }),
          definition("happened", "Month", "date", 2),
        ],
      },
    });
    expect(categoryResponse.statusCode).toBe(201);
    const category = categoryResponse.json().data;
    expect(category.propertySchemaV2.map(({ key }: { key: string }) => key)).toEqual(["impact", "tools", "happened"]);
    // 만든 사용자의 목록에만 보인다.
    expect((await careerService.listCategories(firstUserId)).map(({ id }) => id)).toContain(category.id);
    expect((await careerService.listCategories(secondUserId)).map(({ id }) => id)).not.toContain(category.id);

    const first = await careerService.createRecord(firstUserId, `custom:first:${randomUUID()}`, {
      categoryId: category.id,
      title: "Custom record",
      properties: {
        impact: { type: "number", value: 42 },
        tools: { type: "multi_select", value: [postgresOption.id] },
        happened: { type: "date", value: { start: "2026-08-01", end: null, timezone: null } },
      },
      bodyMd: "Improved throughput by 42 percent.",
    });
    const second = await careerService.createRecord(firstUserId, `custom:second:${randomUUID()}`, {
      categoryId: category.id,
      title: "Related record",
      properties: { tools: { type: "multi_select", value: [typescriptOption.id] } },
      bodyMd: "Built a TypeScript service.",
    });
    expect((await careerService.getRecord(firstUserId, first.record.id)).properties).toMatchObject({ impact: { type: "number", value: 42 } });
    // 정의와 타입이 다른 값, 정의에 없는 키는 저장하지 않는다.
    await expect(careerService.createRecord(firstUserId, `custom:bad-type:${randomUUID()}`, {
      categoryId: category.id,
      title: "Wrong type",
      properties: { impact: { type: "text", value: "42" } },
      bodyMd: "",
    })).rejects.toMatchObject({ statusCode: 400 });
    await expect(careerService.createRecord(firstUserId, `custom:unknown:${randomUUID()}`, {
      categoryId: category.id,
      title: "Unknown key",
      properties: { missing: { type: "text", value: "x" } },
      bodyMd: "",
    })).rejects.toMatchObject({ statusCode: 400 });
    // 다른 사용자는 이 카테고리에 기록을 만들 수 없다.
    await expect(careerService.createRecord(secondUserId, `custom:foreign:${randomUUID()}`, {
      categoryId: category.id,
      title: "Foreign",
      properties: {},
      bodyMd: "",
    })).rejects.toMatchObject({ statusCode: 404 });

    await careerService.createLink(firstUserId, first.record.id, second.record.id, "related");
    expect(await careerService.listLinks(firstUserId, first.record.id)).toMatchObject([
      { relatedRecordId: second.record.id },
    ]);
    expect(await careerService.listLinks(firstUserId, second.record.id)).toMatchObject([
      { relatedRecordId: first.record.id },
    ]);

    const secondExperienceId = (await careerService.listCategories(secondUserId)).find((item) => item.key === "experience")!.id;
    const other = await careerService.createRecord(secondUserId, `other:${randomUUID()}`, {
      categoryId: secondExperienceId,
      title: "Other user record",
      properties: {},
      bodyMd: "Private evidence.",
    });
    await expect(
      careerService.createLink(firstUserId, first.record.id, other.record.id, "related"),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("keeps a trashed record for 30 days and leaves portfolio/deployment material unchanged", async () => {
    const created = await careerService.createRecord(firstUserId, `trash:${randomUUID()}`, {
      categoryId: experienceCategoryId,
      title: "Published evidence",
      properties: {},
      bodyMd: "This exact sentence is already materialized.",
    });
    const db = mongoCollections(fixture.resource.db);
    const portfolio = { id: randomUUID() };
    const block = { id: randomUUID() };
    const deployment = { id: randomUUID() };
    const sectionId = randomUUID();
    // 이 사례는 이미 생성된 지면과 인용의 보존을 검사합니다. 생성 그래프는 생성 모듈에서 검증합니다.
    await db.portfolios.insertOne({ _id: portfolio.id, userId: firstUserId, brewId: randomUUID(), templateId: randomUUID(), title: "Published", status: "published", createdAt: new Date(), updatedAt: new Date(), styleOverrides: {} });
    await db.portfolioSections.insertOne({ _id: sectionId, userId: firstUserId, portfolioId: portfolio.id, orderNo: 0, visible: true });
    await db.blocks.insertOne({ _id: block.id, userId: firstUserId, portfolioSectionId: sectionId, kind: "paragraph", content: { text: "Frozen snapshot sentence" }, style: {}, sourceRecordId: created.record.id, syncState: "synced", locked: false, orderNo: 0 });
    await db.recordUsages.insertOne({ _id: randomUUID(), userId: firstUserId, recordId: created.record.id, blockId: block.id, quotedText: "This exact sentence", firstUsedAt: new Date() });
    await db.deployments.insertOne({ _id: deployment.id, userId: firstUserId, portfolioId: portfolio.id, version: 1, subdomain: `career-${randomUUID()}`, seoIndexable: false, contactVisibility: "hidden", publishedAt: new Date(), hasUnpublishedChanges: false, snapshot: {}, seo: {} });

    const deletedAt = new Date("2026-08-09T00:00:00Z");
    await expect(
      careerService.getDeleteImpact(firstUserId, created.record.id, deletedAt),
    ).resolves.toMatchObject({ portfolioCount: 1, blockCount: 1 });
    const impact = await careerService.trashRecord(firstUserId, created.record.id, deletedAt);
    expect(impact).toMatchObject({ portfolioCount: 1, blockCount: 1 });
    expect(impact.purgeAfter).toBe("2026-09-08T00:00:00.000Z");
    await expect(careerService.getRecord(firstUserId, created.record.id)).rejects.toBeInstanceOf(CareerError);
    const material = await db.blocks.findOne({ _id: block.id });
    expect({ content: material?.content, sourceRecordId: material?.sourceRecordId }).toEqual({
      content: { text: "Frozen snapshot sentence" },
      sourceRecordId: created.record.id,
    });
    expect((await db.deployments.find({ _id: deployment.id }).toArray()).map((row) => ({ id: row._id }))).toEqual([
      { id: deployment.id },
    ]);

    await expect(
      careerService.restoreRecord(firstUserId, created.record.id, new Date("2026-09-07T23:59:59Z")),
    ).resolves.toMatchObject({ id: created.record.id });
    await careerService.trashRecord(firstUserId, created.record.id, deletedAt);
    await expect(
      careerService.restoreRecord(firstUserId, created.record.id, new Date("2026-09-08T00:00:00Z")),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("derives skill level and exact evidence only from owned record spans", async () => {
    const firstText = "Operated Kubernetes clusters in production.";
    const secondText = "Scaled Kubernetes workloads with safe rollouts.";
    const first = await careerService.createRecord(firstUserId, `skill:first:${randomUUID()}`, {
      categoryId: experienceCategoryId,
      title: "Platform operations",
      properties: {},
      bodyMd: firstText,
    });
    const second = await careerService.createRecord(firstUserId, `skill:second:${randomUUID()}`, {
      categoryId: experienceCategoryId,
      title: "Platform scaling",
      properties: {},
      bodyMd: secondText,
    });
    const spanFor = (text: string) => {
      const start = text.indexOf("Kubernetes");
      return { source: "body_md" as const, start, end: start + "Kubernetes".length, quote: "Kubernetes" };
    };
    const weak = await careerService.recomputeSkill(firstUserId, {
      name: "K8s",
      evidence: [{ recordId: first.record.id, span: spanFor(firstText) }],
    });
    expect(weak).toMatchObject({ name: "kubernetes", evidenceCount: 1, strength: "weak", level: 1 });

    const supported = await careerService.recomputeSkill(firstUserId, {
      name: "Kubernetes",
      evidence: [
        { recordId: first.record.id, span: spanFor(firstText) },
        { recordId: second.record.id, span: spanFor(secondText) },
      ],
    });
    expect(supported).toMatchObject({ evidenceCount: 2, strength: "supported", level: 2 });
    const evidence = (await careerService.listSkillEvidence(firstUserId, supported.id)).map((row) => ({ extracted_span: row.span, body_md: row.recordId === first.record.id ? firstText : secondText }));
    expect(evidence).toHaveLength(2);
    expect(evidence.every(({ extracted_span, body_md }) =>
      body_md.includes(extracted_span.quote))).toBe(true);
    expect(await careerService.listSkillEvidence(firstUserId, supported.id)).toHaveLength(2);
    const evidenceResponse = await app.inject({
      method: "GET",
      url: `/v1/career/skills/${supported.id}/evidence`,
      headers: auth(),
    });
    expect(evidenceResponse.statusCode).toBe(200);
    expect(evidenceResponse.json().data).toHaveLength(2);
    expect(evidenceResponse.json().data[0].span.quote).toBe("Kubernetes");

    await expect(careerService.recomputeSkill(firstUserId, {
      name: "Kubernetes",
      evidence: [{
        recordId: first.record.id,
        span: { ...spanFor(firstText), quote: "fabricated" },
      }],
    })).rejects.toMatchObject({ statusCode: 400 });
    const noEvidence = await app.inject({
      method: "POST",
      url: "/v1/career/skills/recompute",
      headers: auth(),
      payload: { name: "Unsupported", evidence: [] },
    });
    expect(noEvidence.statusCode).toBe(400);
  });
});
