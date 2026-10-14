import { createHash, randomUUID } from "node:crypto";
import { CareerDocumentBootstrapSchema, CareerUpdateAckSchema, type CareerDocumentBootstrap } from "@expresso/contracts";
import { mongoCollections, type CareerRecordDoc } from "@expresso/database";
import { careerDocumentToMarkdown, encodeDocumentAsYUpdate, reconstructYDocument, type CareerDocument } from "@expresso/editor";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMongoFixture } from "../../../test/support/mongodb.js";
import { CanonicalCareerReadService } from "../career/canonical-reads.js";
import { CareerService } from "../career/service.js";
import { MongoIdentityService } from "../identity/index.js";
import { registerCareerDocumentRoutes } from "./routes.js";
import { CareerDocumentService } from "./service.js";

const blockId = "11111111-1111-4111-8111-111111111111";
const firstClient = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const reopenedClient = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
function document(text: string): CareerDocument {
  return { schemaVersion: 1, type: "doc", content: [{ id: blockId, type: "paragraph", attrs: {}, text: [{ text }] }] };
}
function text(value: CareerDocument) { return value.content[0]?.text?.[0]?.text; }

// 사용자 데이터 대신 매 실행마다 새로 생성하고 삭제하는 Mongo fixture만 사용합니다.
describe.skipIf(!(process.env.TEST_MONGODB_ADMIN_URL ?? process.env.TEST_MONGODB_URL))("document state across reopen and compaction", () => {
  let fixture: Awaited<ReturnType<typeof createMongoFixture>>;
  let userId: string;
  let career: CareerService;
  let documents: CareerDocumentService;
  let reader: CanonicalCareerReadService;
  let app: FastifyInstance;
  beforeAll(async () => {
    fixture = await createMongoFixture("documentstate");
    userId = (await new MongoIdentityService(fixture.resource).signup({ email: `state-${randomUUID()}@example.com`, password: "correct-horse-battery", displayName: "본문 상태" })).user.id;
    career = new CareerService(fixture.resource);
    documents = new CareerDocumentService(fixture.resource);
    reader = new CanonicalCareerReadService(fixture.resource);
    app = Fastify();
    app.decorateRequest("auth", null);
    registerCareerDocumentRoutes(app, { service: documents, authenticateRequest: async request => { request.auth = { user: { id: userId } } as never; } });
    await app.ready();
  }, 60_000);
  afterAll(async () => { await app?.close(); await fixture?.dispose(); });

  async function scenario(initialText: string) {
    const category = await career.createCategory(userId, { key: `state_${randomUUID().replaceAll("-", "")}`, name: "본문 상태", icon: "folder", defaultView: "table", propertySchema: {} });
    const db = mongoCollections(fixture.resource.db);
    await db.careerCategories.updateOne({ _id: category.id }, { $set: { propertySchemaV2: [], schemaVersion: 1 } });
    const bodyMd = `\`\`\`expresso-block\n${JSON.stringify(document(initialText).content[0])}\n\`\`\``;
    const record = (await career.createRecord(userId, randomUUID(), { categoryId: category.id, title: "업무 필드 유지", properties: {}, bodyMd })).record;
    await db.careerRecords.updateOne({ _id: record.id }, { $set: { propertyValues: [] } });
    const stored = await db.careerRecords.findOne({ _id: record.id });
    expect(stored).not.toBeNull();
    return { recordId: record.id, stored: stored! };
  }
  async function bootstrap(recordId: string) {
    const response = await app.inject({ method: "GET", url: `/v1/career/records/${recordId}/document` });
    expect(response.statusCode).toBe(200);
    return CareerDocumentBootstrapSchema.parse(response.json());
  }
  async function append(recordId: string, bytes: Uint8Array, clientId: string, clientSequence: number, version: number) {
    const response = await app.inject({ method: "POST", url: `/v1/career/records/${recordId}/document/updates`, payload: { clientId, clientSequence, updateBase64: Buffer.from(bytes).toString("base64"), checksum: createHash("sha256").update(bytes).digest("hex") } });
    expect(response.statusCode).toBe(200);
    const ack = CareerUpdateAckSchema.parse(response.json());
    expect(ack).toMatchObject({ recordId, clientId, clientSequence, serverSequence: version, documentVersion: version });
    return ack;
  }
  async function assertSaved(recordId: string, original: CareerRecordDoc, expected: CareerDocument) {
    const current = await bootstrap(recordId);
    expect(current.documentVersion).toBe(2);
    expect(current.document).toEqual(expected);
    const stored = await mongoCollections(fixture.resource.db).careerRecords.findOne({ _id: recordId });
    expect(stored).toMatchObject({ documentVersion: 2, title: original.title, bodyMd: original.bodyMd, properties: original.properties, propertyValues: original.propertyValues, version: original.version, updatedAt: original.updatedAt });
    const canonical = await reader.mapRecord(stored!);
    expect(canonical.bodyMd).toBe(careerDocumentToMarkdown(expected));
    expect(canonical.version).toBe(original.version);
    expect(canonical.title).toBe(original.title);
    return current;
  }

  it("saves a second edit from the authoritative HTTP bootstrap state before socket replay", async () => {
    const { recordId, stored } = await scenario("base2");
    const initial = await bootstrap(recordId);
    const originalBase = encodeDocumentAsYUpdate(initial.document);
    const first = encodeDocumentAsYUpdate(document("saved2"), [originalBase], `${firstClient}:1`);
    await append(recordId, first, firstClient, 1, 1);
    const reopened = await bootstrap(recordId);
    expect(text(reopened.document)).toBe("saved2");
    const state = (reopened as CareerDocumentBootstrap & { stateUpdateBase64?: string }).stateUpdateBase64;
    // JSON을 다시 인코딩하는 fallback도 실행하여 기존 구현의 실제 본문 손실을 검증합니다.
    const reopenedBase = state ? Buffer.from(state, "base64") : encodeDocumentAsYUpdate(reopened.document);
    const expected = document("next2");
    const second = encodeDocumentAsYUpdate(expected, [reopenedBase], `${reopenedClient}:1`);
    expect(reconstructYDocument([reopenedBase, second])).toEqual(expected);
    await append(recordId, second, reopenedClient, 1, 2);
    await assertSaved(recordId, stored, expected);
    expect(state).toEqual(expect.any(String));
    expect(reconstructYDocument([Buffer.from(state!, "base64")])).toEqual(reopened.document);
  });

  it("keeps an active client's original causal stream valid after server compaction", async () => {
    const { recordId, stored } = await scenario("base0");
    const initial = await bootstrap(recordId);
    const originalBase = encodeDocumentAsYUpdate(initial.document);
    const first = encodeDocumentAsYUpdate(document("saved0"), [originalBase], `${firstClient}:1`);
    await append(recordId, first, firstClient, 1, 1);
    expect(text((await bootstrap(recordId)).document)).toBe("saved0");
    await documents.compact(recordId, 1);
    expect(await mongoCollections(fixture.resource.db).careerDocumentUpdates.countDocuments({ recordId, compactedAt: { $ne: null } })).toBe(1);
    const expected = document("next0");
    // 편집 중인 클라이언트는 서버의 압축 여부와 관계없이 기존 인과 상태를 유지합니다.
    const second = encodeDocumentAsYUpdate(expected, [originalBase, first], `${reopenedClient}:1`);
    expect(reconstructYDocument([originalBase, first, second])).toEqual(expected);
    await append(recordId, second, reopenedClient, 1, 2);
    await assertSaved(recordId, stored, expected);
    const snapshot = await mongoCollections(fixture.resource.db).careerDocumentSnapshots.findOne({ recordId, serverSequence: 1 });
    expect(snapshot).toHaveProperty("stateUpdate");
  });
});
