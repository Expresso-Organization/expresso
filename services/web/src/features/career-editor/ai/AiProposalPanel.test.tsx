// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AiProposalPanel, type AiProposalClient, type AiProposalView } from "./AiProposalPanel";

const recordId = "00000000-0000-4000-8000-000000000001";
const blockId = "00000000-0000-4000-8000-000000000002";
const proposalId = "00000000-0000-4000-8000-000000000003";
const propertyId = "00000000-0000-4000-8000-000000000004";
const proposal: AiProposalView = { proposalId, recordId, baseDocumentVersion: 3, selection: { blockIds: [blockId] }, summary: "성과를 선명하게 다듬었습니다.", commands: [{ type: "setText", blockId, text: "사용자 20% 증가" }], propertyChanges: [{ propertyId, previousValue: { type: "number", value: 10 }, nextValue: { type: "number", value: 20 } }], createdAt: "2026-09-01T00:00:00.000Z", expiresAt: "2026-09-01T00:15:00.000Z", status: "ready" };
function client(overrides: Partial<AiProposalClient> = {}): AiProposalClient { return { create: vi.fn(async () => proposal), get: vi.fn(async () => proposal), apply: vi.fn(async () => ({ ...proposal, status: "applied" as const, appliedDocumentVersion: 4 })), reject: vi.fn(async () => undefined), cancel: vi.fn(async () => undefined), undo: vi.fn(async () => undefined), ...overrides }; }

describe("AiProposalPanel", () => {
  afterEach(cleanup);
  it("shows streaming state, hydrates a proposal and partially applies checked changes", async () => {
    let resolve!: (value: AiProposalView) => void;
    const api = client({ create: vi.fn(() => new Promise<AiProposalView>((done) => { resolve = done; })) });
    render(<AiProposalPanel recordId={recordId} documentVersion={3} selectedBlockIds={[blockId]} client={api} />);
    fireEvent.change(screen.getByLabelText("AI에게 편집 요청"), { target: { value: "성과를 다듬어 줘" } });
    fireEvent.click(screen.getByRole("button", { name: "제안 만들기" }));
    expect(screen.getByRole("status").textContent).toContain("제안 작성 중");
    resolve(proposal);
    expect(await screen.findByText(proposal.summary)).toBeTruthy();
    const checks = screen.getAllByRole("checkbox"); fireEvent.click(checks[1]!);
    fireEvent.click(screen.getByRole("button", { name: /개 변경 적용/ }));
    await waitFor(() => expect(api.apply).toHaveBeenCalledWith(recordId, proposalId, { expectedDocumentVersion: 3, commandIndexes: [0], propertyChangeIndexes: [] }));
  });

  it("keeps the review on a live-edit conflict and supports reject, cancel and confirmed undo", async () => {
    const apply: AiProposalClient["apply"] = vi.fn(async () => { throw new Error("사람의 편집 내용과 충돌했습니다."); });
    const api = client({ apply });
    render(<AiProposalPanel recordId={recordId} documentVersion={4} announcedProposal={{ proposalId, baseDocumentVersion: 3 }} client={api} />);
    expect(await screen.findByText(proposal.summary)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /개 변경 적용/ }));
    expect((await screen.findByRole("alert")).textContent).toContain("충돌");
    expect(screen.getByText(proposal.summary)).toBeTruthy();
    cleanup();
    const undoApi = client();
    render(<AiProposalPanel recordId={recordId} documentVersion={4} selectedBlockIds={[blockId]} client={undoApi} />);
    fireEvent.click(screen.getByRole("button", { name: "문장 다듬기" }));
    expect(await screen.findByText(proposal.summary)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /개 변경 적용/ }));
    expect(await screen.findByRole("button", { name: "변경 되돌리기" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "변경 되돌리기" }));
    fireEvent.click(screen.getByRole("button", { name: "되돌리기 확인" }));
    expect(await screen.findByRole("button", { name: /개 변경 적용/ })).toBeTruthy();
    expect(undoApi.undo).toHaveBeenCalledWith(recordId, proposalId, 4);
  });

  it("preserves editor focus and exposes reject and in-flight cancellation", async () => {
    const api = client();
    render(<><button type="button">본문 포커스</button><AiProposalPanel recordId={recordId} documentVersion={3} selectedBlockIds={[blockId]} client={api} /></>);
    const editorFocus = screen.getByRole("button", { name: "본문 포커스" }); editorFocus.focus();
    const quick = screen.getByRole("button", { name: "성과를 더 구체적으로" }); fireEvent.pointerDown(quick); quick.focus(); fireEvent.click(quick);
    expect(await screen.findByText(proposal.summary)).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(editorFocus));
    fireEvent.click(screen.getByRole("button", { name: "거절" }));
    await waitFor(() => expect(api.reject).toHaveBeenCalledWith(recordId, proposalId));
    cleanup();
    const streaming = { ...proposal, status: "streaming" as const, progress: { phase: "generating" as const, completed: 1, total: 3 } };
    const cancelApi = client({ get: vi.fn(async () => streaming) });
    render(<AiProposalPanel recordId={recordId} documentVersion={3} selectedBlockIds={[blockId]} announcedProposal={{ proposalId, baseDocumentVersion: 3, status: "streaming", progress: streaming.progress }} client={cancelApi} />);
    expect(await screen.findByText(/제안 작성 중/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    await waitFor(() => expect(cancelApi.cancel).toHaveBeenCalledWith(recordId, proposalId));
  });

  it("starts a requested selection action once and shows human-readable before and after values", async () => {
    const api = client();
    const handled = vi.fn();
    render(<AiProposalPanel recordId={recordId} documentVersion={3} selectedBlockIds={[blockId]} requestedPrompt={{ id: "request-1", recordId, prompt: "선택한 문장을 짧게" }} onRequestHandled={handled} document={{ schemaVersion: 1, type: "doc", content: [{ id: blockId, type: "paragraph", attrs: {}, text: [{ text: "사용자 10% 증가" }] }] }} definitions={[{ id: propertyId, key: "outcome", name: "성과 수치", type: "number", required: false, system: false, config: {}, order: 0, version: 1, deletedAt: null }]} client={api} />);
    await waitFor(() => expect(api.create).toHaveBeenCalledWith(recordId, { prompt: "선택한 문장을 짧게", selection: { blockIds: [blockId] } }));
    expect(await screen.findByText("사용자 10% 증가")).toBeTruthy();
    expect(screen.getByText("성과 수치 변경")).toBeTruthy();
    expect(handled).toHaveBeenCalledOnce();
  });
});
