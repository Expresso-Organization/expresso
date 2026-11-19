import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { CONSENT_POLICY_VERSION, type AgentGoalDraft } from "@expresso/contracts";
import { mongoCollections } from "@expresso/database";
import { createMongoFixture } from "../../../test/support/mongodb.js";
import { MongoIdentityService } from "../identity/index.js";
import { CareerService } from "../career/index.js";
import { CareerDocumentService } from "../career-editor/index.js";
import { PortfolioReadService } from "../portfolios/index.js";
import { PageElementIssues, PageService } from "../page/index.js";
import { AgentCredentials } from "./credentials.js";
import { ConsentService } from "../consent/index.js";
import { AgentToolRejection, type AgentRuntime } from "../../platform/agent/runtime.js";
import { AgentChatService, CREDITS_EXHAUSTED, RUN_HEARTBEAT_MS, RUN_INTERRUPTED_ERROR } from "./service.js";
import { MongoEntitlementService } from "../entitlements/index.js";
import { PreparationPlans } from "./plans.js";

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
    // 다른 인스턴스의 취소는 실행 인스턴스의 다음 heartbeat에서 전달된다. 한 주기와 그 갱신의
    // 왕복이 걸리므로, 타이머 · DB 지연을 받을 한 주기를 더 기다린다.
    await expect.poll(() => stopped, { timeout: RUN_HEARTBEAT_MS * 2 }).toBe(true);
    expect((await service.get(userId, row.id)).run?.status).toBe("cancelled");
  });
  it("서버가 사라진 실행을 중단 상태로 복원한다", async () => {
    const service = make(null); const row = await service.create(userId, []);
    await mongoCollections(fixture.resource.db).agentConversations.updateOne({ _id: row.id }, { $set: { run: { id: randomUUID(), requestId: randomUUID(), status: "running", error: null, startedAt: new Date().toISOString() }, heartbeatAt: new Date(0) } });
    expect((await service.get(userId, row.id)).run?.status).toBe("interrupted");
  });
  it("서버 종료로 끊긴 실행은 런타임 오류가 무엇이든 중단으로 남기고 실패로 보고하지 않는다", async () => {
    let started = false;
    // 운영 Agent SDK는 abort를 받으면 자식 프로세스 종료 오류로 끝난다. 그 모양을 그대로 흉내 낸다.
    const service = make({ run: input => new Promise<void>((_, reject) => { started = true; input.signal.addEventListener("abort", () => reject(new Error("Claude Code process exited with code 143")), { once: true }); }) });
    const failures: unknown[] = []; service.setRunFailureListener(error => failures.push(error));
    const row = await service.create(userId, []);
    await service.send(userId, row.id, { requestId: randomUUID(), text: "프로젝트를 정리해줘" });
    await expect.poll(() => started).toBe(true);
    await service.close();
    const run = (await make(null).get(userId, row.id)).run;
    expect(run).toMatchObject({ status: "interrupted", error: RUN_INTERRUPTED_ERROR });
    expect(failures).toEqual([]);
  });
  it("종료와 무관한 실패는 실패로 남기고 원인을 수신자에게 넘긴다", async () => {
    const service = make({ run: async () => { throw new Error("모델 오류"); } });
    const failures: Array<{ error: unknown; conversationId: string }> = [];
    service.setRunFailureListener((error, run) => failures.push({ error, conversationId: run.conversationId }));
    const row = await service.create(userId, []);
    await service.send(userId, row.id, { requestId: randomUUID(), text: "질문" });
    await expect.poll(async () => (await service.get(userId, row.id)).run?.status).toBe("failed");
    expect((await service.get(userId, row.id)).run?.error).not.toBe(RUN_INTERRUPTED_ERROR);
    expect(failures).toEqual([{ error: expect.objectContaining({ message: "모델 오류" }), conversationId: row.id }]);
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
  it("목표 변경은 승인할 때만, 바뀌는 칸만 저장한다", async () => {
    await career.saveJobGoal(userId, { work: "프론트엔드 개발", place: "커머스 회사", timing: "내년 상반기", source: "app" });
    let seen: unknown;
    const goalTool = (draft: AgentGoalDraft) => ({ type: "tool" as const, tool: { id: randomUUID(), name: "구직 목표 변경", status: "complete" as const, summary: "바뀌는 칸", goalDraft: draft } });
    const service = make({ run: async input => {
      seen = input.jobGoal;
      // 바뀌는 칸이 없거나 지금 글과 같으면 돌려보낸다.
      await expect(input.goalDraft({})).rejects.toBeInstanceOf(AgentToolRejection);
      await expect(input.goalDraft({ work: "프론트엔드  개발" })).rejects.toBeInstanceOf(AgentToolRejection);
      // 같은 실행에서 고쳐 제안하면 앞선 초안은 닫힌다.
      await input.emit(goalTool(await input.goalDraft({ work: "데이터 엔지니어" })));
      await input.emit(goalTool(await input.goalDraft({ work: "백엔드 개발", place: "커머스 회사" })));
    } });
    const row = await service.create(userId, []);
    await service.send(userId, row.id, { requestId: randomUUID(), text: "이제 백엔드 개발로 가고 싶어요" });
    await expect.poll(async () => (await service.get(userId, row.id)).run?.status).toBe("complete");
    expect(seen).toEqual({ work: "프론트엔드 개발", place: "커머스 회사", timing: "내년 상반기" });
    const [first, second] = (await service.get(userId, row.id)).messages.at(-1)!.tools.map(tool => tool.goalDraft!);
    expect(first).toMatchObject({ work: "데이터 엔지니어", status: "replaced" });
    // 지금 글과 같은 칸(place)은 바뀌는 칸으로 세우지 않는다.
    expect(second).toMatchObject({ work: "백엔드 개발", place: null, timing: null, previous: { work: "프론트엔드 개발", place: "커머스 회사", timing: "내년 상반기" }, status: "ready" });
    await expect(service.decideGoalDraft(userId, row.id, first!.draftId, { action: "approve" })).rejects.toMatchObject({ statusCode: 409 });
    await expect(service.decideGoalDraft(other, row.id, second!.draftId, { action: "approve" })).rejects.toMatchObject({ statusCode: 404 });
    expect((await career.getJobGoal(userId))!.work).toBe("프론트엔드 개발");
    // 카드가 선 뒤 구직 목표 화면에서 고친 칸은 승인이 되돌리지 않는다.
    await career.saveJobGoal(userId, { work: "프론트엔드 개발", place: "커머스 회사", timing: "올해 안", source: "app" });
    const approved = await service.decideGoalDraft(userId, row.id, second!.draftId, { action: "approve" });
    expect(approved.messages.at(-1)!.tools[1]!.goalDraft!.status).toBe("approved");
    expect(await career.getJobGoal(userId)).toMatchObject({ work: "백엔드 개발", place: "커머스 회사", timing: "올해 안", source: "chat" });
    // 같은 결정은 그대로 응답하고, 다른 결정은 받지 않는다.
    await service.decideGoalDraft(userId, row.id, second!.draftId, { action: "approve" });
    await expect(service.decideGoalDraft(userId, row.id, second!.draftId, { action: "reject" })).rejects.toMatchObject({ statusCode: 409 });
  });
  it("그대로 둔 목표 변경은 저장하지 않고, 새 제안은 앞선 대기 초안을 닫으며 그 칸을 이어받는다", async () => {
    await career.saveJobGoal(userId, { work: "프론트엔드 개발", place: "", timing: "", source: "app" });
    const inputs = [{ work: "백엔드 개발" }, { work: "데이터 엔지니어" }, { place: "보안 회사" }];
    const service = make({ run: async input => {
      const draft = await input.goalDraft(inputs.shift()!);
      await input.emit({ type: "tool", tool: { id: randomUUID(), name: "구직 목표 변경", status: "complete", summary: "바뀌는 칸 1", goalDraft: draft } });
    } });
    const row = await service.create(userId, []);
    const turn = async (text: string) => { await service.send(userId, row.id, { requestId: randomUUID(), text }); await expect.poll(async () => (await service.get(userId, row.id)).run?.status).toBe("complete"); return (await service.get(userId, row.id)).messages.at(-1)!.tools[0]!.goalDraft!; };
    const rejected = await turn("백엔드로 갈까 해요");
    expect((await service.decideGoalDraft(userId, row.id, rejected.draftId, { action: "reject" })).messages.at(-1)!.tools[0]!.goalDraft!.status).toBe("rejected");
    expect((await career.getJobGoal(userId))!.work).toBe("프론트엔드 개발");
    const waiting = await turn("데이터 엔지니어가 낫겠어요");
    await turn("일하고 싶은 곳은 보안 회사예요");
    const drafts = (await service.get(userId, row.id)).messages.flatMap(message => message.tools).map(tool => tool.goalDraft!);
    expect(drafts.map(draft => draft.status)).toEqual(["rejected", "replaced", "ready"]);
    // 거절한 변경은 이어받지 않고, 대기 중이던 변경의 칸만 이어받는다.
    expect(drafts.at(-1)).toMatchObject({ work: "데이터 엔지니어", place: "보안 회사", timing: null });
    await expect(service.decideGoalDraft(userId, row.id, waiting.draftId, { action: "approve" })).rejects.toMatchObject({ statusCode: 409 });
  });
  it("보완점은 최신 요건 대조를 기준으로만 기록하고, 대조가 오래되면 다시 대조하게 한다", async () => {
    const jobId = randomUUID();
    const jobs = { get: async () => ({ descriptionRaw: "자격 요건\n\n원래 본문을 다룬 경험" }) as never };
    let step = 0; let rejected: string[] = [];
    const service = new AgentChatService(fixture.resource, { run: async input => {
      step += 1;
      const question = input.messages.at(-1)!;
      if (step === 1) {
        await expect(input.gapReview({ summary: "요약", items: [{ requirementIndex: 0, type: "skill", status: "needs_confirmation", priority: "high", explanation: "설명", suggestedAction: "확인", evidence: [] }] })).rejects.toBeInstanceOf(AgentToolRejection);
        const read = await input.records.read([recordId]);
        const review = await input.review({ jobPostingId: jobId, summary: "요약", items: [{ requirement: "본문 경험", jobQuote: "원래 본문을 다룬 경험", kind: "must", assessment: "partial", explanation: "설명", recommendation: "", evidence: [{ recordId, quote: read[0]!.text.split("\n\n")[1]!.slice(0, 4) }] }] });
        await input.emit({ type: "tool", tool: { id: randomUUID(), name: "요건 대조", status: "complete", summary: "", review } });
        return;
      }
      try {
        const gapReview = await input.gapReview({ summary: "요약", items: [{ requirementIndex: 0, type: "experience", status: "needs_improvement", priority: "high", explanation: "설명", suggestedAction: "경험 쌓기", evidence: [{ sourceType: "user_message", sourceId: question.id, quote: "해 본 적이 없어요" }] }] });
        await input.emit({ type: "tool", tool: { id: randomUUID(), name: "보완점 정리", status: "complete", summary: "", gapReview } });
      } catch (error) { if (error instanceof AgentToolRejection) rejected = error.issues; else throw error; }
    } }, career, jobs, documents, consent, new AgentCredentials(fixture.resource));
    services.push(service);
    const row = await service.create(userId, [{ kind: "job", id: jobId }]);
    const finish = async (text: string) => { await service.send(userId, row.id, { requestId: randomUUID(), text }); await expect.poll(async () => (await service.get(userId, row.id)).run?.status).toBe("complete"); };
    await finish("대조해 줘");
    await finish("그 일은 해 본 적이 없어요. 보완점 정리해 줘");
    const gap = (await service.get(userId, row.id)).messages.at(-1)!.tools[0]!.gapReview!;
    expect(gap.items[0]).toMatchObject({ requirement: "본문 경험", jobQuote: "원래 본문을 다룬 경험", status: "needs_improvement", evidence: [{ label: "내 답변" }] });
    const current = await documents.bootstrap(userId, recordId);
    const proposal = await documents.createPreparedAiProposal(userId, recordId, { prompt: "수정", selection: { blockIds: current.document.content.map(block => block.id) } }, { summary: "수정", commands: [{ type: "setText", blockId: current.document.content[0]!.id, text: "다른 본문" }], propertyChanges: [] });
    await documents.applyAiProposal(userId, recordId, { recordId, proposalId: proposal.proposalId, expectedDocumentVersion: proposal.baseDocumentVersion, commandIndexes: [0], propertyChangeIndexes: [] });
    await finish("그 일은 해 본 적이 없어요. 다시 정리해 줘");
    expect(rejected[0]).toContain("요건 대조를 먼저 다시");
    await documents.undoAiProposal(userId, recordId, { recordId, proposalId: proposal.proposalId, expectedDocumentVersion: (await documents.getAiProposal(userId, recordId, proposal.proposalId)).appliedDocumentVersion! });
  });
  it("보완점이 인용한 기록이나 바탕이 된 대조가 바뀌면 보완점도 다시 대조할 것을 알린다", async () => {
    const jobId = randomUUID();
    const jobs = { get: async () => ({ descriptionRaw: "자격 요건\n\n원래 본문을 다룬 경험" }) as never };
    const category = (await career.listCategories(userId))[0]!;
    const create = async (title: string, bodyMd: string) => (await career.createRecord(userId, randomUUID(), { categoryId: category.id, title, bodyMd, properties: {} })).record.id;
    const cited = await create("보완점 근거 기록", "보완점에만 인용한 본문");
    const unrelated = await create("관계없는 기록", "관계없는 본문");
    const rewrite = async (id: string, text: string) => {
      const current = await documents.bootstrap(userId, id);
      const proposal = await documents.createPreparedAiProposal(userId, id, { prompt: "수정", selection: { blockIds: current.document.content.map(block => block.id) } }, { summary: "수정", commands: [{ type: "setText", blockId: current.document.content[0]!.id, text }], propertyChanges: [] });
      await documents.applyAiProposal(userId, id, { recordId: id, proposalId: proposal.proposalId, expectedDocumentVersion: proposal.baseDocumentVersion, commandIndexes: [0], propertyChangeIndexes: [] });
      return async () => documents.undoAiProposal(userId, id, { recordId: id, proposalId: proposal.proposalId, expectedDocumentVersion: (await documents.getAiProposal(userId, id, proposal.proposalId)).appliedDocumentVersion! });
    };
    let step = 0;
    const service = new AgentChatService(fixture.resource, { run: async input => {
      step += 1;
      if (step === 1) {
        const read = await input.records.read([recordId]);
        const review = await input.review({ jobPostingId: jobId, summary: "요약", items: [{ requirement: "본문 경험", jobQuote: "원래 본문을 다룬 경험", kind: "must", assessment: "partial", explanation: "설명", recommendation: "", evidence: [{ recordId, quote: read[0]!.text.split("\n\n")[1]!.slice(0, 4) }] }] });
        await input.emit({ type: "tool", tool: { id: randomUUID(), name: "요건 대조", status: "complete", summary: "", review } });
        return;
      }
      const gapReview = await input.gapReview({ summary: "요약", items: [{ requirementIndex: 0, type: "experience", status: "needs_confirmation", priority: "high", explanation: "설명", suggestedAction: "확인", evidence: [{ sourceType: "record", sourceId: cited, quote: "보완점에만 인용한" }] }] });
      await input.emit({ type: "tool", tool: { id: randomUUID(), name: "보완점 정리", status: "complete", summary: "", gapReview } });
    } }, career, jobs, documents, consent, new AgentCredentials(fixture.resource));
    services.push(service);
    const row = await service.create(userId, [{ kind: "job", id: jobId }]);
    const finish = async (text: string) => { await service.send(userId, row.id, { requestId: randomUUID(), text }); await expect.poll(async () => (await service.get(userId, row.id)).run?.status).toBe("complete"); };
    await finish("대조해 줘");
    await finish("보완점 정리해 줘");
    const toolId = (await service.get(userId, row.id)).messages.at(-1)!.tools[0]!.id;
    const fresh = { stale: false, changed: [] };
    expect(await service.freshness(userId, row.id, toolId)).toEqual(fresh);
    await expect(service.freshness(other, row.id, toolId)).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.freshness(userId, row.id, randomUUID())).rejects.toMatchObject({ statusCode: 404 });
    const undoUnrelated = await rewrite(unrelated, "다른 본문");
    expect(await service.freshness(userId, row.id, toolId)).toEqual(fresh);
    await undoUnrelated();
    const undoCited = await rewrite(cited, "다른 본문");
    expect(await service.freshness(userId, row.id, toolId)).toEqual({ stale: true, changed: ["records"] });
    await undoCited();
    expect(await service.freshness(userId, row.id, toolId)).toEqual(fresh);
    const undoBase = await rewrite(recordId, "다른 본문");
    expect(await service.freshness(userId, row.id, toolId)).toEqual({ stale: true, changed: ["records"] });
    await undoBase();
  });
  it("보완점에서 고른 번호로 준비 계획 초안을 만들고, 승인하면 계획이 하나 생긴다", async () => {
    const jobId = randomUUID();
    const jobs = { get: async () => ({ descriptionRaw: "자격 요건\n\n원래 본문을 다룬 경험" }) as never };
    let step = 0; const rejected: string[][] = [];
    const service = new AgentChatService(fixture.resource, { run: async input => {
      step += 1;
      const emit = async (name: string, extra: object) => input.emit({ type: "tool", tool: { id: randomUUID(), name, status: "complete", summary: "", ...extra } });
      if (step === 1) {
        await expect(input.planDraft({ title: "계획", summary: "요약", gapIndexes: [0], settings: { weeklyHours: 5, weeks: 4, startDate: "2026-10-19" } })).rejects.toBeInstanceOf(AgentToolRejection);
        const read = await input.records.read([recordId]);
        await emit("요건 대조", { review: await input.review({ jobPostingId: jobId, summary: "요약", items: [{ requirement: "본문 경험", jobQuote: "원래 본문을 다룬 경험", kind: "must", assessment: "partial", explanation: "설명", recommendation: "", evidence: [{ recordId, quote: read[0]!.text.split("\n\n")[1]!.slice(0, 4) }] }] }) });
        await emit("보완점 정리", { gapReview: await input.gapReview({ summary: "요약", items: [{ requirementIndex: 0, type: "skill", status: "needs_improvement", priority: "high", explanation: "설명", suggestedAction: "작은 예제", evidence: [{ sourceType: "user_message", sourceId: input.messages.at(-1)!.id, quote: "해 본 적이 없어요" }] }] }) });
        return;
      }
      for (const settings of [{ weeklyHours: 1, weeks: 1, startDate: "2026-10-19" }, { weeklyHours: 1, weeks: 4, startDate: "2026-10-19" }]) {
        try { await emit("준비 계획 초안", { planDraft: await input.planDraft({ title: "본문 경험 준비", summary: "요약", gapIndexes: [0], settings }) }); }
        catch (error) { if (error instanceof AgentToolRejection) rejected.push(error.issues); else throw error; }
      }
    } }, career, jobs, documents, consent, new AgentCredentials(fixture.resource));
    services.push(service);
    const row = await service.create(userId, [{ kind: "job", id: jobId }]);
    const finish = async (text: string) => { await service.send(userId, row.id, { requestId: randomUUID(), text }); await expect.poll(async () => (await service.get(userId, row.id)).run?.status).toBe("complete"); };
    await finish("그 일은 해 본 적이 없어요. 대조하고 보완점 정리해 줘");
    await finish("주 1시간으로 계획 세워 줘");
    expect(rejected[0]![0]).toContain("총 3시간이 필요한데");
    const draft = (await service.get(userId, row.id)).messages.at(-1)!.tools[0]!.planDraft!;
    expect(draft.tasks.map(task => [task.kind, task.week, task.date])).toEqual([["learn", 1, "2026-10-19"], ["project", 2, "2026-10-26"], ["check", 3, "2026-11-02"]]);
    expect(await mongoCollections(fixture.resource.db).preparationPlans.countDocuments({ userId })).toBe(0);
    const decision = { action: "approve" as const, title: "고친 계획", summary: "요약", taskEdits: draft.tasks.map(task => ({ id: task.id, title: `${task.title} (고침)`, action: task.action, deliverable: task.deliverable })) };
    await expect(service.decidePlanDraft(userId, row.id, draft.draftId, { ...decision, taskEdits: decision.taskEdits.slice(1) })).rejects.toMatchObject({ statusCode: 422 });
    const approved = (await service.decidePlanDraft(userId, row.id, draft.draftId, decision)).messages.at(-1)!.tools[0]!.planDraft!;
    expect(approved).toMatchObject({ status: "approved", planId: draft.draftId, title: "고친 계획" });
    await service.decidePlanDraft(userId, row.id, draft.draftId, decision);
    expect(await mongoCollections(fixture.resource.db).preparationPlans.countDocuments({ userId })).toBe(1);
    const plan = await service.plan(userId, approved.planId!);
    expect(plan).toMatchObject({ title: "고친 계획", jobPostingId: jobId, version: 1, scheduleVersion: 1 });
    expect(plan.tasks.every(task => task.status === "not_started" && task.title.endsWith("(고침)"))).toBe(true);
    await expect(service.plan(other, approved.planId!)).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.decidePlanDraft(userId, row.id, draft.draftId, { action: "reject" })).rejects.toMatchObject({ statusCode: 409 });
  });
  it("계획 작업 진행을 버전으로 지키고, 승인한 재배치는 남은 작업만 옮긴다", async () => {
    const replans: string[] = [];
    const service = make({ run: async input => {
      const planId = input.messages.at(-1)!.text;
      const plan = await input.readPlan(planId);
      expect(plan?.tasks).toHaveLength(3);
      const draft = await input.replanDraft({ planId, settings: { weeklyHours: 3, weeks: 1, startDate: "2026-11-02" } });
      replans.push(draft.draftId);
      await input.emit({ type: "tool", tool: { id: randomUUID(), name: "계획 재배치 초안", status: "complete", summary: "", replanDraft: draft } });
    } });
    const row = await service.create(userId, []);
    const settings = { weeklyHours: 1, weeks: 4, startDate: "2026-10-19" };
    const tasks = ["learn", "project", "check"].map((kind, index) => ({ id: randomUUID(), gapId: randomUUID(), requirement: "요건", kind: kind as "learn", week: index + 1, date: ["2026-10-19", "2026-10-26", "2026-11-02"][index]!, minutes: 60, title: `작업 ${index + 1}`, action: "할 일", deliverable: "결과물" }));
    const plans = new PreparationPlans(fixture.resource);
    const plan = await plans.create(userId, row.id, { draftId: randomUUID(), jobPostingId: randomUUID(), title: "계획", summary: "요약", settings, tasks, status: "ready", planId: null }, { title: "계획", summary: "요약", tasks: new Map(tasks.map(task => [task.id, task])) });
    const done = await service.updateTaskProgress(userId, plan.id, tasks[0]!.id, { expectedVersion: 1, status: "completed", note: "", outcome: "예제를 만들었다", outcomeUrl: "", spentMinutes: 70 });
    expect(done).toMatchObject({ version: 2 });
    expect(done.tasks[0]).toMatchObject({ status: "completed", outcome: "예제를 만들었다", spentMinutes: 70 });
    await expect(service.updateTaskProgress(userId, plan.id, tasks[1]!.id, { expectedVersion: 1, status: "in_progress", note: "", outcome: "", outcomeUrl: "", spentMinutes: 0 })).rejects.toMatchObject({ statusCode: 409 });
    await expect(service.updateTaskProgress(other, plan.id, tasks[1]!.id, { expectedVersion: 2, status: "in_progress", note: "", outcome: "", outcomeUrl: "", spentMinutes: 0 })).rejects.toMatchObject({ statusCode: 404 });
    const finish = async () => { await service.send(userId, row.id, { requestId: randomUUID(), text: plan.id }); await expect.poll(async () => (await service.get(userId, row.id)).run?.status).toBe("complete"); };
    await finish();
    const approved = await service.decideReplanDraft(userId, row.id, replans[0]!, { action: "approve" });
    expect(approved.messages.at(-1)!.tools[0]!.replanDraft!.status).toBe("approved");
    const moved = await service.plan(userId, plan.id);
    expect(moved).toMatchObject({ scheduleVersion: 2, settings: { weeklyHours: 3, weeks: 1, startDate: "2026-11-02" } });
    expect(moved.tasks.map(task => [task.status, task.week, task.date])).toEqual([["completed", 1, "2026-10-19"], ["not_started", 1, "2026-11-02"], ["not_started", 1, "2026-11-02"]]);
    await finish();
    await service.updateTaskProgress(userId, plan.id, tasks[1]!.id, { expectedVersion: moved.version, status: "in_progress", note: "시작", outcome: "", outcomeUrl: "", spentMinutes: 10 });
    await expect(service.decideReplanDraft(userId, row.id, replans[1]!, { action: "approve" })).rejects.toMatchObject({ statusCode: 409 });
    expect((await service.decideReplanDraft(userId, row.id, replans[1]!, { action: "reject" })).messages.at(-1)!.tools[0]!.replanDraft!.status).toBe("rejected");
  });
  it("다듬기에서 고른 요소를 메시지에 남기고, 지면 고침을 카드로 저장하며, 최신 판일 때만 되돌린다", async () => {
    const db = mongoCollections(fixture.resource.db); const portfolioId = randomUUID(); const now = new Date();
    await db.portfolios.insertOne({ _id: portfolioId, userId, brewId: randomUUID(), templateId: (await db.templates.findOne({}))!._id, title: "다듬기 검증", status: "draft", createdAt: now, updatedAt: now, styleOverrides: {} });
    // 지면 모듈은 구조화 지면 통합 테스트가 본다. 여기서는 대화가 지면 도구를 어떻게 잇는지만 본다.
    let revision = 4;
    const structured = { spec: { root: "page", elements: { page: { type: "PortfolioPage", props: {}, children: ["toc"] }, toc: { type: "ProjectIndex", props: {}, children: [] } } }, content: { profile: { name: "가상" }, sections: [] } };
    const pages = {
      latest: async () => ({ revision, html: "<main></main>", generationManifest: { structured } }) as never,
      elementGuide: vi.fn(async () => ({ typeLabel: "작업 목차", title: "작업 목차" })) as never,
      editElementByAgent: vi.fn(async (_user: string, _portfolio: string, _key: string, changes: { text?: { value: string }[] }) => {
        if (changes.text?.[0]?.value.includes("99")) throw new PageElementIssues(["출처에 없는 숫자가 있습니다(99)."]);
        revision += 1;
        // 긴 본문을 고친 고침도 대화에 저장되고 다시 읽힌다(지면 본문 한도 20,000자).
        return { page: { revision }, changes: [{ label: "제목", before: "긴 제목", after: "짧은 제목" }, { label: "본문", before: "가".repeat(20_000), after: "나".repeat(19_000) }], label: "작업 목차" };
      }),
      restoreRevision: vi.fn(async () => { revision += 1; return { revision }; }) as never,
    };
    let context: unknown; const outcomes: unknown[] = [];
    const runtime: AgentRuntime = { run: async input => {
      context = input.context;
      outcomes.push(await input.page.edit({ portfolioId, key: "toc", note: "줄였습니다.", text: [{ path: "/x", value: "99개" }] }).catch(error => error));
      outcomes.push(await input.page.read(randomUUID(), "toc").catch(error => error));
      const pageEdit = await input.page.edit({ portfolioId, key: "toc", note: "줄였습니다.", text: [{ path: "/x", value: "짧은 제목" }] });
      await input.emit({ type: "tool", tool: { id: randomUUID(), name: "지면 요소 고침", status: "complete", summary: "작업 목차 · 바뀐 곳 1", pageEdit } });
    } };
    const service = new AgentChatService(fixture.resource, runtime, career, { get: async () => { throw new Error("없는 공고"); } }, documents, consent, new AgentCredentials(fixture.resource), new PortfolioReadService(fixture.resource), pages as never);
    services.push(service);
    const row = await service.create(userId, [{ kind: "portfolio", id: portfolioId }]);
    const selection = { portfolioId, key: "toc", label: "작업 목차" };
    await expect(service.send(userId, row.id, { requestId: randomUUID(), text: "짧게", selection: { ...selection, portfolioId: randomUUID() } })).rejects.toMatchObject({ statusCode: 409 });
    await service.send(userId, row.id, { requestId: randomUUID(), text: "이 문장 더 짧게", selection });
    await expect.poll(async () => (await service.get(userId, row.id)).run?.status).toBe("complete");
    // 구조화 지면은 HTML 대신 목차를 싣는다.
    expect(context).toEqual([expect.objectContaining({ kind: "portfolio", data: expect.objectContaining({ generatedPage: { revision: 4, outline: [{ key: "toc", depth: 0, title: "작업 목차", type: "작업 목차" }] } }) })]);
    expect(outcomes[0]).toBeInstanceOf(AgentToolRejection);
    expect((outcomes[0] as AgentToolRejection).issues).toEqual(["출처에 없는 숫자가 있습니다(99)."]);
    expect((outcomes[1] as AgentToolRejection).issues).toEqual([expect.stringContaining("연결된 포트폴리오")]);
    expect(pages.editElementByAgent).toHaveBeenLastCalledWith(userId, portfolioId, "toc", { text: [{ path: "/x", value: "짧은 제목" }] }, { instruction: "이 문장 더 짧게", rationale: "줄였습니다." });
    const saved = await service.get(userId, row.id);
    expect(saved.messages[0]!.selection).toEqual(selection);
    const pageEdit = saved.messages[1]!.tools[0]!.pageEdit!;
    expect(pageEdit).toMatchObject({ portfolioId, key: "toc", label: "작업 목차", revision: 5, undone: false });
    // 되돌리기는 이 고침이 최신 판일 때 바로 앞 판을 새 판으로 쌓는다. 두 번 눌러도 한 번이다.
    const undone = await service.undoPageEdit(userId, row.id, pageEdit.editId);
    expect(pages.restoreRevision).toHaveBeenCalledWith(userId, portfolioId, { revision: 4, expectedRevision: 5 });
    expect(undone.messages[1]!.tools[0]!.pageEdit!.undone).toBe(true);
    await service.undoPageEdit(userId, row.id, pageEdit.editId);
    expect(pages.restoreRevision).toHaveBeenCalledTimes(1);
    await expect(service.undoPageEdit(other, row.id, pageEdit.editId)).rejects.toMatchObject({ statusCode: 404 });
    // 그 뒤에 다른 편집이 쌓였으면 덮지 않는다.
    await service.send(userId, row.id, { requestId: randomUUID(), text: "다시 짧게", selection });
    await expect.poll(async () => (await service.get(userId, row.id)).run?.status).toBe("complete");
    const later = (await service.get(userId, row.id)).messages[3]!.tools[0]!.pageEdit!;
    revision += 1;
    await expect(service.undoPageEdit(userId, row.id, later.editId)).rejects.toMatchObject({ statusCode: 409 });
    expect(pages.restoreRevision).toHaveBeenCalledTimes(1);
  });
  it("연결되지 않은 기록에 대한 도구 실행을 차단한다", async () => {
    let rejected = false;
    const service = make({ run: async input => { try { await input.propose(recordId, { summary: "불허", commands: [], propertyChanges: [] }); } catch { rejected = true; } } });
    const row = await service.create(userId, []);
    await service.send(userId, row.id, { requestId: randomUUID(), text: "다른 기록 수정" });
    await expect.poll(() => rejected).toBe(true);
  });
  it("서버 인증으로 도는 실행은 이번 달 크레딧을 다 쓰면 시작하지 않고, 개인 키로 도는 실행은 시작한다", async () => {
    const identity = new MongoIdentityService(fixture.resource);
    const spender = (await identity.signup({ email: `${randomUUID()}@example.com`, password: "correct-horse-battery", displayName: "한도 검증" })).user.id;
    await consent.grant(spender, ["career_records"], CONSENT_POLICY_VERSION);
    const keys: (string | undefined)[] = [];
    let fail = true;
    const runtime: AgentRuntime = { run: async input => { keys.push(input.apiKey); if (fail) throw new Error("실행 실패"); await input.emit({ type: "text", text: "답" }); } };
    const service = new AgentChatService(fixture.resource, runtime, career, { get: async () => { throw new Error("없는 공고"); } }, documents, consent, new AgentCredentials(fixture.resource), new PortfolioReadService(fixture.resource), new PageService(fixture.resource), new MongoEntitlementService(fixture.resource));
    service.setRunFailureListener(() => {}); services.push(service);
    const conversation = await service.create(spender, []);

    // 한도가 남은 동안에는 서버 인증으로 시작한다. 이 실행은 실패로 끝내 다시 보낼 질문을 남긴다.
    expect(await service.creditsExhausted(spender)).toBe(false);
    await service.send(spender, conversation.id, { requestId: randomUUID(), text: "안녕" });
    await vi.waitFor(async () => expect((await service.get(spender, conversation.id)).run?.status).toBe("failed"));
    expect(keys).toEqual([undefined]);

    // 이번 달 사용량이 한도를 넘는다.
    await mongoCollections(fixture.resource.db).aiUsageEvents.insertOne({
      _id: randomUUID(), userId: spender, contract: "agent_chat", model: "claude-sonnet-4-5",
      inputTokens: 0, outputTokens: 100_000_000, cacheReadTokens: 0, cacheCreationTokens: 0,
      costUsd: null, durationMs: 1, createdAt: new Date(),
    });
    expect(await service.creditsExhausted(spender)).toBe(true);
    const before = await service.get(spender, conversation.id);
    await expect(service.send(spender, conversation.id, { requestId: randomUUID(), text: "한 번 더" })).rejects.toMatchObject({ statusCode: 403, publicMessage: CREDITS_EXHAUSTED });
    await expect(service.retry(spender, conversation.id)).rejects.toMatchObject({ statusCode: 403, publicMessage: CREDITS_EXHAUSTED });
    // 거절된 요청은 대화를 바꾸지 않고 런타임도 부르지 않는다.
    expect(await service.get(spender, conversation.id)).toEqual(before);
    expect(keys).toHaveLength(1);

    // 개인 키로 도는 실행은 그 키의 계정이 비용을 내므로 한도를 보지 않는다.
    fail = false;
    await service.retry(spender, conversation.id, "sk-ant-test-personal-key-value");
    await vi.waitFor(async () => expect((await service.get(spender, conversation.id)).run?.status).toBe("complete"));
    expect(keys).toEqual([undefined, "sk-ant-test-personal-key-value"]);

    // 다른 계정의 한도는 그대로다.
    expect(await service.creditsExhausted(userId)).toBe(false);
  });
  it("대화에서 시작한 제작은 연결된 공고만 받고, 분석은 하나로 모이며, 제작은 한 번만 만들어진다", async () => {
    const identity = new MongoIdentityService(fixture.resource);
    const maker = (await identity.signup({ email: `${randomUUID()}@example.com`, password: "correct-horse-battery", displayName: "제작 검증" })).user.id;
    await consent.grant(maker, ["career_records", "job_posting_analysis"], CONSENT_POLICY_VERSION);
    const jobPostingId = randomUUID(); const jobAnalysisId = randomUUID();
    let analysis: { status: "running" | "done" | "failed"; stage: "covering" | "done" | "failed"; failure: { code: string; retryable: boolean } | null } = { status: "running", stage: "covering", failure: null };
    const coverage = ["covered", "covered", "partial", "missing"];
    const analyzePosting = vi.fn(async () => ({ jobAnalysisId }));
    const createBrew = vi.fn(async () => { await new Promise(resolve => setTimeout(resolve, 20)); return { brewId: randomUUID() }; });
    const trashed = new Set<string>(); let brewStage: "draft" | "interviewing" = "draft";
    const brewStatus = vi.fn(async (_user: string, id: string) => (trashed.has(id) ? null : brewStage));
    let failAfterCard = false;
    const getResult = vi.fn(async () => ({ analysis: { jobAnalysisId, ...analysis, attempts: 1, resultVersion: 1, analyzedAt: null }, requirements: analysis.status === "done" ? coverage.map(item => ({ coverage: item })) : [], sourceText: null, previous: null }) as never);
    const jobs = { get: async (_user: string, id: string) => { if (id !== jobPostingId) throw new Error("없는 공고"); return { id, title: "프론트엔드 개발자", company: { name: "가상 회사" } } as never; } };
    let target = jobPostingId;
    const seen: unknown[] = [];
    const rejections: string[] = [];
    const runtime: AgentRuntime = { run: async input => {
      seen.push(input.brews);
      try {
        const brewStart = await input.startBrew({ jobPostingId: target });
        await input.emit({ type: "tool", tool: { id: randomUUID(), name: "포트폴리오 제작", status: "complete", summary: "가상 회사 · 프론트엔드 개발자", brewStart } });
        if (failAfterCard) throw new Error("실행 실패");
      } catch (error) { if (!(error instanceof AgentToolRejection)) throw error; rejections.push(error.issues.join(" ")); }
      await input.emit({ type: "text", text: "분석을 시작했어요." });
    } };
    const make = (owner: typeof consent) => { const service = new AgentChatService(fixture.resource, runtime, career, jobs, documents, owner, new AgentCredentials(fixture.resource), new PortfolioReadService(fixture.resource), new PageService(fixture.resource), undefined, { analyzePosting, getResult, createBrew, brewStatus }); service.setRunFailureListener(() => {}); services.push(service); return service; };
    const service = make(consent);
    const conversation = await service.create(maker, [{ kind: "job", id: jobPostingId }]);
    const say = async (text: string) => { await service.send(maker, conversation.id, { requestId: randomUUID(), text }); await vi.waitFor(async () => expect((await service.get(maker, conversation.id)).run?.status).toBe("complete")); return service.get(maker, conversation.id); };
    const starts = (row: Awaited<ReturnType<typeof say>>) => row.messages.flatMap(message => message.tools).flatMap(tool => (tool.brewStart ? [tool.brewStart] : []));

    // 대화에 연결되지 않은 공고의 ID는 받지 않는다. 분석도 맡기지 않는다.
    target = randomUUID();
    expect(starts(await say("다른 공고로 만들어 줘"))).toEqual([]);
    expect(rejections.at(-1)).toContain("대화에 연결된 공고가 아닙니다");
    expect(analyzePosting).not.toHaveBeenCalled();

    // 연결된 공고로 시작하면 카드에 ID가 남는다.
    target = jobPostingId;
    const [first] = starts(await say("이 공고로 포트폴리오 만들어 줘"));
    expect(first).toMatchObject({ jobPostingId, jobAnalysisId, title: "프론트엔드 개발자", companyName: "가상 회사", brewId: null });
    // 분석이 도는 동안에는 확인 수가 없고 제작을 열 수 없다.
    expect(await service.brewStartState(maker, conversation.id, first!.startId)).toEqual({ status: "running", stage: "covering", failure: null, requirements: null, brewId: null });
    await expect(service.openBrew(maker, conversation.id, first!.startId)).rejects.toMatchObject({ statusCode: 409 });
    expect(createBrew).not.toHaveBeenCalled();
    // 남의 대화의 카드는 읽지 못한다.
    await expect(service.brewStartState(userId, conversation.id, first!.startId)).rejects.toMatchObject({ statusCode: 404 });

    // 다시 해 볼 수 있는 실패만 다시 맡긴다.
    analysis = { status: "failed", stage: "failed", failure: { code: "AI_TIMEOUT", retryable: true } };
    await service.retryBrewStart(maker, conversation.id, first!.startId);
    expect(analyzePosting).toHaveBeenCalledTimes(2);
    analysis = { status: "failed", stage: "failed", failure: { code: "EXTRACTOR_UNAVAILABLE", retryable: false } };
    await service.retryBrewStart(maker, conversation.id, first!.startId);
    expect(analyzePosting).toHaveBeenCalledTimes(2);

    // 분석이 끝나면 요건의 확인 수를 센다.
    analysis = { status: "done", stage: "done", failure: null };
    expect(await service.brewStartState(maker, conversation.id, first!.startId)).toMatchObject({ status: "done", requirements: { total: 4, covered: 2, partial: 1, missing: 1 }, brewId: null });
    // 같은 공고로 다시 시작해도 분석은 같고, 카드만 하나 더 생긴다.
    const [, second] = starts(await say("다시 만들어 줘"));
    expect(second).toMatchObject({ jobAnalysisId, brewId: null });
    // 그 실행에는 서버가 읽은 지금 상태가 넘어갔다.
    expect(seen.at(-1)).toEqual([{ jobPostingId, title: "프론트엔드 개발자", companyName: "가상 회사", status: "done", stage: "done", failure: null, requirements: { total: 4, covered: 2, partial: 1, missing: 1 }, brewId: null }]);

    // 두 카드를 동시에 눌러도 제작은 하나다.
    const [left, right] = await Promise.all([service.openBrew(maker, conversation.id, first!.startId), service.openBrew(maker, conversation.id, second!.startId)]);
    expect(createBrew).toHaveBeenCalledTimes(1);
    expect(left).toEqual(right);
    expect(left.path).toBe(`/brew/${left.brewId}/materials`);
    expect(await service.openBrew(maker, conversation.id, first!.startId)).toEqual(left);
    expect(createBrew).toHaveBeenCalledTimes(1);
    expect((await service.brewStartState(maker, conversation.id, second!.startId)).brewId).toBe(left.brewId);
    // 그 뒤에 생긴 카드도 같은 제작을 이어받는다.
    expect(starts(await say("한 번 더")).at(-1)).toMatchObject({ jobAnalysisId, brewId: left.brewId });
    expect(createBrew).toHaveBeenCalledTimes(1);

    // 제작이 다음 단계로 갔으면 그 단계의 화면을 연다.
    brewStage = "interviewing";
    expect(await service.openBrew(maker, conversation.id, first!.startId)).toEqual({ brewId: left.brewId, path: `/brew/${left.brewId}/counter` });
    brewStage = "draft";

    // 다시 보내기는 마지막 답변의 카드를 지운다. 그 카드로 만든 제작은 대화에 적혀 있어 새 카드가 이어받는다.
    const retried = await service.create(maker, [{ kind: "job", id: jobPostingId }]);
    failAfterCard = true;
    await service.send(maker, retried.id, { requestId: randomUUID(), text: "이 공고로 만들어 줘" });
    await vi.waitFor(async () => expect((await service.get(maker, retried.id)).run?.status).toBe("failed"));
    const [lost] = starts(await service.get(maker, retried.id));
    const made = await service.openBrew(maker, retried.id, lost!.startId);
    expect(createBrew).toHaveBeenCalledTimes(2);
    failAfterCard = false;
    await service.retry(maker, retried.id);
    await vi.waitFor(async () => expect((await service.get(maker, retried.id)).run?.status).toBe("complete"));
    const again = starts(await service.get(maker, retried.id));
    expect(again).toHaveLength(1);
    expect(again[0]!.startId).not.toBe(lost!.startId);
    expect(again[0]!.brewId).toBe(made.brewId);
    expect(await service.openBrew(maker, retried.id, again[0]!.startId)).toEqual(made);
    expect(createBrew).toHaveBeenCalledTimes(2);

    // 휴지통에 넣은 제작은 없는 것으로 본다. 카드는 다시 「담을 기록 고르기」가 되고, 누르면 새로 만든다.
    trashed.add(made.brewId);
    expect((await service.brewStartState(maker, retried.id, again[0]!.startId)).brewId).toBeNull();
    const remade = await service.openBrew(maker, retried.id, again[0]!.startId);
    expect(remade.brewId).not.toBe(made.brewId);
    expect(createBrew).toHaveBeenCalledTimes(3);
    expect((await service.brewStartState(maker, retried.id, again[0]!.startId)).brewId).toBe(remade.brewId);
    // 응답에는 대화에 적어 둔 제작 표가 실리지 않는다.
    expect(await service.get(maker, retried.id)).not.toHaveProperty("brewIds");

    // 공고 분석 동의가 꺼진 계정은 시작하지 못한다(기록 사용 동의만 있는 계정).
    const noAnalysis = await service.create(userId, [{ kind: "job", id: jobPostingId }]);
    await service.send(userId, noAnalysis.id, { requestId: randomUUID(), text: "이 공고로 만들어 줘" });
    await vi.waitFor(async () => expect((await service.get(userId, noAnalysis.id)).run?.status).toBe("complete"));
    expect(rejections.at(-1)).toContain("공고 분석 동의가 꺼져 있습니다");
    expect(analyzePosting).toHaveBeenCalledTimes(6);
  });
});
