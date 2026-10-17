import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CONSENT_POLICY_VERSION } from "@expresso/contracts";
import { mongoCollections } from "@expresso/database";
import { createMongoFixture } from "../../../test/support/mongodb.js";
import { MongoIdentityService } from "../identity/index.js";
import { CareerService } from "../career/index.js";
import { CareerDocumentService } from "../career-editor/index.js";
import { PortfolioReadService } from "../portfolios/index.js";
import { PageService } from "../page/index.js";
import { AgentCredentials } from "./credentials.js";
import { ConsentService } from "../consent/index.js";
import { AgentToolRejection, type AgentRuntime } from "../../platform/agent/runtime.js";
import { AgentChatService } from "./service.js";

describe.skipIf(!(process.env.TEST_MONGODB_ADMIN_URL ?? process.env.TEST_MONGODB_URL))("공통 에이전트 대화", () => {
  let fixture: Awaited<ReturnType<typeof createMongoFixture>>;
  let userId: string; let other: string; let recordId: string;
  let career: CareerService; let documents: CareerDocumentService; let consent: ConsentService;
  const services: AgentChatService[] = [];
  const make = (runtime: AgentRuntime | null) => { const service = new AgentChatService(fixture.resource, runtime, career, { get: async () => { throw new Error("없는 공고"); } }, documents, consent, new AgentCredentials(fixture.resource), new PortfolioReadService(fixture.resource), new PageService(fixture.resource)); services.push(service); return service; };
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
  it("동의가 없으면 실행 전 안내 상태를 반환하고 메시지를 저장하지 않는다", async () => {
    let calls = 0;
    const service = make({ run: async () => { calls += 1; } });
    expect(await service.consentRequired(other)).toBe(true);
    expect(await service.consentRequired(userId)).toBe(false);
    const conversation = await service.create(other, []);
    await expect(service.send(other, conversation.id, { requestId: randomUUID(), text: "안녕" })).rejects.toMatchObject({ statusCode: 403, publicDetails: { requiredConsent: "career_records" } });
    expect((await service.get(other, conversation.id)).messages).toHaveLength(0);
    expect(calls).toBe(0);
  });
  it("자료 선택을 저장하고 제외하며 권한과 변경 버전을 검사한다", async () => {
    const service = make(null); const conversation = await service.create(userId, []);
    const selected = await service.setContexts(userId, conversation.id, [{ kind: "record", id: recordId }], conversation.version);
    expect(selected.contexts).toEqual([{ kind: "record", id: recordId }]);
    expect((await service.get(userId, conversation.id)).contexts).toEqual(selected.contexts);
    await expect(service.setContexts(userId, conversation.id, [], conversation.version)).rejects.toMatchObject({ statusCode: 409 });
    await expect(service.setContexts(other, conversation.id, [], selected.version)).rejects.toMatchObject({ statusCode: 404 });
    const removed = await service.setContexts(userId, conversation.id, [], selected.version);
    expect(removed.contexts).toEqual([]);
    const foreign = await service.create(other, []);
    await expect(service.setContexts(other, foreign.id, [{ kind: "record", id: recordId }], foreign.version)).rejects.toMatchObject({ statusCode: 404 });
    expect((await service.get(other, foreign.id)).contexts).toEqual([]);
  });
  it("선택한 포트폴리오 본문을 런타임에 전달하고 다른 사용자의 선택을 차단한다", async () => {
    const db = mongoCollections(fixture.resource.db); const id = randomUUID(); const sectionId = randomUUID(); const now = new Date();
    await db.portfolios.insertOne({ _id: id, userId, brewId: randomUUID(), templateId: (await db.templates.findOne({}))!._id, title: "자료 선택 검증", status: "draft", createdAt: now, updatedAt: now, styleOverrides: {} });
    await db.portfolioSections.insertOne({ _id: sectionId, userId, portfolioId: id, orderNo: 0, visible: true });
    await db.blocks.insertOne({ _id: randomUUID(), userId, portfolioSectionId: sectionId, orderNo: 0, kind: "paragraph", content: { text: "배포 시간을 30% 단축했습니다." }, style: {}, syncState: "detached", locked: false });
    let received: unknown;
    const service = make({ run: async input => { received = input.context; } });
    const row = await service.create(userId, [{ kind: "portfolio", id }, { kind: "record", id: recordId }]);
    await service.send(userId, row.id, { requestId: randomUUID(), text: "자료 확인" });
    await expect.poll(() => received).toBeDefined();
    expect(received).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "portfolio", id, data: expect.objectContaining({ portfolio: expect.objectContaining({ title: "자료 선택 검증", sections: expect.arrayContaining([expect.objectContaining({ blocks: expect.arrayContaining([expect.objectContaining({ content: { text: "배포 시간을 30% 단축했습니다." } })]) })]) }) }) })]));
    await expect(service.create(other, [{ kind: "portfolio", id }])).rejects.toMatchObject({ statusCode: 404 });
  });
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
  it("실패한 답변을 같은 질문으로 다시 만들고 남은 제안을 취소한다", async () => {
    const original = await documents.bootstrap(userId, recordId);
    let attempt = 0;
    const service = make({ run: async input => {
      attempt += 1;
      if (attempt === 1) {
        const proposal = await input.propose(recordId, { summary: "실패 전 제안", commands: [{ type: "setText", blockId: original.document.content[0]!.id, text: "남으면 안 되는 본문" }], propertyChanges: [] });
        await input.emit({ type: "tool", tool: { id: "proposal", name: "기록 변경 제안", status: "complete", summary: proposal.summary, proposal } });
        throw new Error("모델 오류");
      }
      await input.emit({ type: "text", text: "다시 만든 답변" });
    } });
    const row = await service.create(userId, [{ kind: "record", id: recordId }]);
    await service.send(userId, row.id, { requestId: randomUUID(), text: "본문을 다듬어줘" });
    await expect.poll(async () => (await service.get(userId, row.id)).run?.status).toBe("failed");
    const failed = await service.get(userId, row.id);
    const stale = failed.messages.at(-1)!.tools[0]!.proposal!;
    await expect(service.retry(other, row.id)).rejects.toMatchObject({ statusCode: 404 });
    await service.retry(userId, row.id);
    await expect.poll(async () => (await service.get(userId, row.id)).run?.status).toBe("complete");
    const retried = await service.get(userId, row.id);
    expect(retried.messages.map(message => [message.role, message.text])).toEqual([["user", "본문을 다듬어줘"], ["assistant", "다시 만든 답변"]]);
    expect(retried.run?.requestId).toBe(failed.run?.requestId);
    expect((await documents.getAiProposal(userId, recordId, stale.proposalId)).status).toBe("cancelled");
  });
  it("실행 중이거나 다시 보낼 답변이 없으면 다시 보내기를 거절한다", async () => {
    const service = make({ run: input => new Promise<void>(resolve => input.signal.addEventListener("abort", () => resolve(), { once: true })) });
    const empty = await service.create(userId, []);
    await expect(service.retry(userId, empty.id)).rejects.toMatchObject({ statusCode: 409 });
    const row = await service.create(userId, []);
    await service.send(userId, row.id, { requestId: randomUUID(), text: "기다리기" });
    await expect(service.retry(userId, row.id)).rejects.toMatchObject({ statusCode: 409 });
    await service.cancel(userId, row.id);
  });
  it("연결하지 않은 내 기록을 읽고, 인용을 확인한 요건 대조만 저장하며, 기록이 바뀌면 다시 대조할 것을 알린다", async () => {
    const jobId = randomUUID();
    const jobs = { get: async (_user: string, id: string) => { if (id !== jobId) throw new Error("없는 공고"); return { descriptionRaw: "자격 요건\n\n원래 본문을 다룬 경험" } as never; } };
    const service = new AgentChatService(fixture.resource, { run: async input => {
      const listed = await input.records.list();
      const read = await input.records.read([recordId, randomUUID()]);
      await input.emit({ type: "text", text: `${listed.records.some(row => row.id === recordId)}:${read.length}` });
      const item = { requirement: "본문 경험", jobQuote: "원래 본문을 다룬 경험", kind: "must" as const, assessment: "strong" as const, explanation: "근거가 있습니다", recommendation: "" };
      await expect(input.review({ jobPostingId: jobId, summary: "요약", items: [{ ...item, evidence: [{ recordId, quote: "없는 문장" }] }] })).rejects.toBeInstanceOf(AgentToolRejection);
      await expect(input.review({ jobPostingId: randomUUID(), summary: "요약", items: [{ ...item, evidence: [{ recordId, quote: read[0]!.text.split("\n\n")[1]!.slice(0, 4) }] }] })).rejects.toBeInstanceOf(AgentToolRejection);
      const review = await input.review({ jobPostingId: jobId, summary: "요약", items: [{ ...item, evidence: [{ recordId, quote: read[0]!.text.split("\n\n")[1]!.slice(0, 4) }] }] });
      await input.emit({ type: "tool", tool: { id: toolId, name: "요건 대조", status: "complete", summary: "요건 1개", review } });
    } }, career, jobs, documents, consent, new AgentCredentials(fixture.resource));
    services.push(service);
    const toolId = randomUUID();
    const row = await service.create(userId, [{ kind: "job", id: jobId }]);
    await service.send(userId, row.id, { requestId: randomUUID(), text: "요건과 내 기록 비교" });
    await expect.poll(async () => (await service.get(userId, row.id)).run?.status).toBe("complete");
    const answer = (await service.get(userId, row.id)).messages.at(-1)!;
    expect(answer.text).toBe("true:1");
    expect(answer.tools[0]!.review!.items[0]!.evidence[0]!.recordTitle).toBe("채팅 테스트 기록");
    expect(await service.freshness(userId, row.id, toolId)).toEqual({ stale: false, changed: [] });
    await expect(service.freshness(other, row.id, toolId)).rejects.toMatchObject({ statusCode: 404 });
    const current = await documents.bootstrap(userId, recordId);
    const proposal = await documents.createPreparedAiProposal(userId, recordId, { prompt: "수정", selection: { blockIds: current.document.content.map(block => block.id) } }, { summary: "수정", commands: [{ type: "setText", blockId: current.document.content[0]!.id, text: "바뀐 본문" }], propertyChanges: [] });
    await documents.applyAiProposal(userId, recordId, { recordId, proposalId: proposal.proposalId, expectedDocumentVersion: proposal.baseDocumentVersion, commandIndexes: [0], propertyChangeIndexes: [] });
    expect(await service.freshness(userId, row.id, toolId)).toEqual({ stale: true, changed: ["records"] });
    await documents.undoAiProposal(userId, recordId, { recordId, proposalId: proposal.proposalId, expectedDocumentVersion: (await documents.getAiProposal(userId, recordId, proposal.proposalId)).appliedDocumentVersion! });
  });
  it("대화에서 한 말로 만든 기록 초안은 승인할 때만 기록이 되고, 두 번 승인해도 하나다", async () => {
    let attempt = 0;
    const service = make({ run: async input => {
      attempt += 1;
      const question = input.messages.at(-1)!;
      await expect(input.draftRecord({ title: "지어낸 초안", bodyMd: "본문", sources: [{ messageId: question.id, quote: "말하지 않은 문장" }] })).rejects.toBeInstanceOf(AgentToolRejection);
      const draft = await input.draftRecord({ title: `EKS 위 Airflow 운영 ${attempt}`, bodyMd: "## 행동\nEKS 위에 Airflow를 올려 운영", sources: [{ messageId: question.id, quote: "EKS 위에 Airflow를 올려서" }] });
      await input.emit({ type: "tool", tool: { id: randomUUID(), name: "새 기록 초안", status: "complete", summary: draft.title, recordDraft: draft } });
    } });
    const category = (await career.listCategories(userId))[0]!;
    const before = (await career.listRecords(userId, { sort: "updated_desc", limit: 100 })).data.length;
    const row = await service.create(userId, []);
    await service.send(userId, row.id, { requestId: randomUUID(), text: "인턴 때 EKS 위에 Airflow를 올려서 운영해 봤어요. 기록으로 남겨 줘." });
    await expect.poll(async () => (await service.get(userId, row.id)).run?.status).toBe("complete");
    const draft = (await service.get(userId, row.id)).messages.at(-1)!.tools[0]!.recordDraft!;
    expect(draft).toMatchObject({ status: "ready", recordId: null });
    expect(draft.categories.some(item => item.id === category.id)).toBe(true);
    expect((await career.listRecords(userId, { sort: "updated_desc", limit: 100 })).data.length).toBe(before);
    const decision = { action: "approve" as const, title: "EKS 위 Airflow 운영", bodyMd: "## 행동\n고친 본문", categoryId: category.id };
    await expect(service.decideRecordDraft(other, row.id, draft.draftId, decision)).rejects.toMatchObject({ statusCode: 404 });
    const approved = (await service.decideRecordDraft(userId, row.id, draft.draftId, decision)).messages.at(-1)!.tools[0]!.recordDraft!;
    expect(approved).toMatchObject({ status: "approved", title: "EKS 위 Airflow 운영", bodyMd: "## 행동\n고친 본문" });
    expect((await career.getRecord(userId, approved.recordId!)).title).toBe("EKS 위 Airflow 운영");
    await service.decideRecordDraft(userId, row.id, draft.draftId, decision);
    expect((await career.listRecords(userId, { sort: "updated_desc", limit: 100 })).data.length).toBe(before + 1);
    await expect(service.decideRecordDraft(userId, row.id, draft.draftId, { action: "reject" })).rejects.toMatchObject({ statusCode: 409 });
  });
  it("거절한 초안은 기록을 만들지 않는다", async () => {
    const service = make({ run: async input => {
      const draft = await input.draftRecord({ title: "거절할 초안", bodyMd: "본문", sources: [{ messageId: input.messages.at(-1)!.id, quote: "배포를 자동화" }] });
      await input.emit({ type: "tool", tool: { id: randomUUID(), name: "새 기록 초안", status: "complete", summary: draft.title, recordDraft: draft } });
    } });
    const before = (await career.listRecords(userId, { sort: "updated_desc", limit: 100 })).data.length;
    const row = await service.create(userId, []);
    await service.send(userId, row.id, { requestId: randomUUID(), text: "배포를 자동화했어요" });
    await expect.poll(async () => (await service.get(userId, row.id)).run?.status).toBe("complete");
    const draft = (await service.get(userId, row.id)).messages.at(-1)!.tools[0]!.recordDraft!;
    expect((await service.decideRecordDraft(userId, row.id, draft.draftId, { action: "reject" })).messages.at(-1)!.tools[0]!.recordDraft!.status).toBe("rejected");
    expect((await career.listRecords(userId, { sort: "updated_desc", limit: 100 })).data.length).toBe(before);
  });
  it("연결되지 않은 기록에 대한 도구 실행을 차단한다", async () => {
    let rejected = false;
    const service = make({ run: async input => { try { await input.propose(recordId, { summary: "불허", commands: [], propertyChanges: [] }); } catch { rejected = true; } } });
    const row = await service.create(userId, []);
    await service.send(userId, row.id, { requestId: randomUUID(), text: "다른 기록 수정" });
    await expect.poll(() => rejected).toBe(true);
  });
});
