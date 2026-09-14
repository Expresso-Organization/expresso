import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CONSENT_POLICY_VERSION } from "@expresso/contracts";
import { mongoCollections } from "@expresso/database";
import { createMongoFixture } from "../../../test/support/mongodb.js";
import { MongoIdentityService } from "../identity/index.js";
import { CareerService } from "../career/index.js";
import { CareerDocumentService } from "../career-editor/index.js";
import { ConsentService } from "../consent/index.js";
import type { AgentRuntime } from "../../platform/agent/runtime.js";
import { AgentChatService } from "./service.js";

describe.skipIf(!(process.env.TEST_MONGODB_ADMIN_URL ?? process.env.TEST_MONGODB_URL))("공통 에이전트 대화", () => {
  let fixture: Awaited<ReturnType<typeof createMongoFixture>>;
  let userId: string; let other: string; let recordId: string;
  let career: CareerService; let documents: CareerDocumentService; let consent: ConsentService;
  const services: AgentChatService[] = [];
  const make = (runtime: AgentRuntime | null) => { const service = new AgentChatService(fixture.resource, runtime, career, { get: async () => { throw new Error("없는 공고"); } }, documents, consent); services.push(service); return service; };
  beforeAll(async () => {
    fixture = await createMongoFixture("agentchat");
    const identity = new MongoIdentityService(fixture.resource);
    userId = (await identity.signup({ email: `${randomUUID()}@example.com`, password: "correct-horse-battery", displayName: "채팅 검증" })).user.id;
    other = (await identity.signup({ email: `${randomUUID()}@example.com`, password: "correct-horse-battery", displayName: "다른 사용자" })).user.id;
    career = new CareerService(fixture.resource); documents = new CareerDocumentService(fixture.resource); consent = new ConsentService(fixture.resource);
    await consent.grant(userId, ["career_records"], CONSENT_POLICY_VERSION);
    const category = (await career.listCategories(userId))[0]!;
    recordId = (await career.createRecord(userId, randomUUID(), { categoryId: category.id, title: "채팅 테스트 기록", bodyMd: "원래 본문", properties: {} })).record.id;
  }, 60_000);
  afterAll(async () => { await Promise.all(services.map(service => service.close())); await fixture?.dispose(); });
  it("저장된 대화를 다른 서비스 인스턴스에서 복원하고 중복 요청을 한 번만 처리한다", async () => {
    const service = make({ run: async input => { await input.emit({ type: "text", text: "첫 " }); await input.emit({ type: "text", text: "응답" }); } });
    const conversation = await service.create(userId, []); const input = { requestId: randomUUID(), text: "질문" };
    await service.send(userId, conversation.id, input);
    await expect.poll(async () => (await service.get(userId, conversation.id)).run?.status).toBe("complete");
    const restored = await make(null).get(userId, conversation.id);
    expect(restored.messages.map(message => message.text)).toEqual(["질문", "첫 응답"]);
    expect((await service.send(userId, conversation.id, input)).messages).toHaveLength(2);
    expect((await service.list(userId)).some(row => row.id === conversation.id)).toBe(true);
    await expect(service.get(other, conversation.id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.send(other, conversation.id, { ...input, requestId: randomUUID() })).rejects.toMatchObject({ statusCode: 404 });
  });
  it("문맥 소유권을 검사하고 AI 미설정 시 메시지를 저장하지 않는다", async () => {
    const service = make(null);
    await expect(service.create(other, [{ kind: "record", id: recordId }])).rejects.toMatchObject({ statusCode: 404 });
    const row = await service.create(userId, [{ kind: "record", id: recordId }]);
    await expect(service.send(userId, row.id, { requestId: randomUUID(), text: "질문" })).rejects.toMatchObject({ statusCode: 503 });
    expect((await service.get(userId, row.id)).messages).toHaveLength(0);
  });
  it("동시 실행을 막고 다른 인스턴스의 취소를 실행 신호로 전달한다", async () => {
    let stopped = false;
    const service = make({ run: input => new Promise<void>(resolve => input.signal.addEventListener("abort", () => { stopped = true; resolve(); }, { once: true })) });
    const row = await service.create(userId, []);
    await service.send(userId, row.id, { requestId: randomUUID(), text: "기다리기" });
    await expect(service.send(userId, row.id, { requestId: randomUUID(), text: "겹치는 요청" })).rejects.toMatchObject({ statusCode: 409 });
    await expect(service.cancel(other, row.id)).rejects.toMatchObject({ statusCode: 404 });
    await make(null).cancel(userId, row.id);
    await expect.poll(() => stopped).toBe(true);
    expect((await service.get(userId, row.id)).run?.status).toBe("cancelled");
  });
  it("서버가 사라진 실행을 중단 상태로 복원한다", async () => {
    const service = make(null); const row = await service.create(userId, []);
    await mongoCollections(fixture.resource.db).agentConversations.updateOne({ _id: row.id }, { $set: { run: { id: randomUUID(), requestId: randomUUID(), status: "running", error: null, startedAt: new Date().toISOString() }, heartbeatAt: new Date(0) } });
    expect((await service.get(userId, row.id)).run?.status).toBe("interrupted");
  });
  it("제안은 승인 전 원문을 바꾸지 않고, 다른 대화의 승인을 거절하며 적용과 되돌리기를 저장한다", async () => {
    const original = await documents.bootstrap(userId, recordId);
    const service = make({ run: async input => {
      const proposal = await input.propose(recordId, { summary: "본문 다듬기", commands: [{ type: "setText", blockId: original.document.content[0]!.id, text: "검토한 본문" }], propertyChanges: [] });
      await input.emit({ type: "tool", tool: { id: "proposal", name: "기록 변경 제안", status: "complete", summary: proposal.summary, proposal } });
      await input.emit({ type: "text", text: "변경을 검토해 주세요." });
    } });
    const row = await service.create(userId, [{ kind: "record", id: recordId }]);
    await service.send(userId, row.id, { requestId: randomUUID(), text: "본문을 다듬어줘" });
    await expect.poll(async () => (await service.get(userId, row.id)).run?.status).toBe("complete");
    const proposal = (await service.get(userId, row.id)).messages.at(-1)!.tools[0]!.proposal!;
    expect((await documents.bootstrap(userId, recordId)).documentVersion).toBe(original.documentVersion);
    const input = { proposalId: proposal.proposalId, action: "apply" as const, expectedDocumentVersion: proposal.baseDocumentVersion };
    const another = await service.create(userId, []);
    await expect(service.approve(userId, another.id, input)).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.approve(other, row.id, input)).rejects.toMatchObject({ statusCode: 404 });
    const applied = await service.approve(userId, row.id, input);
    expect(applied.messages.at(-1)!.tools[0]!.proposal!.status).toBe("applied");
    expect((await documents.bootstrap(userId, recordId)).document.content[0]!.text?.[0]?.text).toBe("검토한 본문");
    const undone = await service.approve(userId, row.id, { ...input, action: "undo", expectedDocumentVersion: applied.messages.at(-1)!.tools[0]!.proposal!.appliedDocumentVersion! });
    expect(undone.messages.at(-1)!.tools[0]!.undone).toBe(true);
    expect((await documents.bootstrap(userId, recordId)).document.content).toEqual(original.document.content);
  });
  it("연결되지 않은 기록에 대한 도구 실행을 차단한다", async () => {
    let rejected = false;
    const service = make({ run: async input => { try { await input.propose(recordId, { summary: "불허", commands: [], propertyChanges: [] }); } catch { rejected = true; } } });
    const row = await service.create(userId, []);
    await service.send(userId, row.id, { requestId: randomUUID(), text: "다른 기록 수정" });
    await expect.poll(() => rejected).toBe(true);
  });
});
