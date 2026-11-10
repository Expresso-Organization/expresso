import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { AiProposalRejectRequestSchema } from "@expresso/contracts";
import { AgentChatService } from "./service.js";

function fixture() {
  const owner = randomUUID(), conversationId = randomUUID(), recordId = randomUUID(), proposalId = randomUUID();
  const proposal = { proposalId, recordId, status: "ready", commands: [], propertyChanges: [], baseDocumentVersion: 3 };
  const row = { _id: conversationId, userId: owner, run: { status: "complete" }, messages: [{ tools: [{ id: randomUUID(), proposal }] }] };
  const rows = { updateOne: vi.fn(async () => ({ matchedCount: 1 })) };
  const documents = {
    rejectAiProposal: vi.fn(async (_owner: string, _record: string, input: unknown) => { AiProposalRejectRequestSchema.parse(input); }),
    applyAiProposal: vi.fn(async () => {}), undoAiProposal: vi.fn(async () => {}),
    getAiProposal: vi.fn(async () => ({ ...proposal, status: "rejected" })),
  };
  const service = new AgentChatService({ db: { collection: () => rows } } as never, null, {} as never, {} as never, documents as never, {} as never);
  vi.spyOn(service as unknown as { owned(userId: string, id: string): Promise<unknown> }, "owned").mockResolvedValue(row);
  vi.spyOn(service, "get").mockResolvedValue({ id: conversationId } as never);
  return { service, documents, row, rows, owner, conversationId, recordId, proposalId };
}
it("거절 요청은 계약의 두 식별자만 전달하고 대화의 거절 상태를 저장한다", async () => {
  const f = fixture();
  await f.service.approve(f.owner, f.conversationId, { proposalId: f.proposalId, action: "reject", expectedDocumentVersion: 3 });
  expect(f.documents.rejectAiProposal).toHaveBeenCalledWith(f.owner, f.recordId, { recordId: f.recordId, proposalId: f.proposalId });
  expect(f.rows.updateOne).toHaveBeenCalledWith(expect.objectContaining({ userId: f.owner }), expect.objectContaining({ $set: { "messages.$[].tools.$[tool].proposal": expect.objectContaining({ status: "rejected" }) } }), expect.any(Object));
  expect(f.documents.applyAiProposal).not.toHaveBeenCalled(); expect(f.documents.undoAiProposal).not.toHaveBeenCalled();
});
it.each(["apply", "undo"] as const)("%s는 문서 버전 검사를 유지한다", async action => {
  const f = fixture();
  await f.service.approve(f.owner, f.conversationId, { proposalId: f.proposalId, action, expectedDocumentVersion: 3 });
  const call = action === "apply" ? f.documents.applyAiProposal : f.documents.undoAiProposal;
  expect(call).toHaveBeenCalledWith(f.owner, f.recordId, expect.objectContaining({ expectedDocumentVersion: 3 }));
  expect(f.documents.rejectAiProposal).not.toHaveBeenCalled();
});
it("실행 중 거절을 계속 차단한다", async () => {
 const f = fixture(); f.row.run.status = "running";
 await expect(f.service.approve(f.owner, f.conversationId, { proposalId: f.proposalId, action: "reject", expectedDocumentVersion: 3 })).rejects.toMatchObject({ statusCode: 409 });
 expect(f.documents.rejectAiProposal).not.toHaveBeenCalled();
});
it("다른 대화의 제안을 거절할 수 없다", async () => {
 const f = fixture();
 await expect(f.service.approve(f.owner, f.conversationId, { proposalId: randomUUID(), action: "reject", expectedDocumentVersion: 3 })).rejects.toMatchObject({ statusCode: 404 });
 expect(f.documents.rejectAiProposal).not.toHaveBeenCalled();
});
