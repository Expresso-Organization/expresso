// @vitest-environment jsdom

import type { CareerRecordListItem } from "@expresso/contracts";
import { createEmptyCareerDocument } from "@expresso/editor";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

// 채팅의 네트워크·스크롤은 별도 테스트와 실제 브라우저에서 검증합니다.
vi.mock("@/features/agent-chat/AgentChat", () => ({ AgentChat: () => null }));
vi.mock("../ai/AiProposalPanel", () => ({ AiProposalPanel: () => <div>제안 패널</div> }));
// BlockNote는 실제 브라우저에서 검증합니다. 여기서는 편집기가 받는 값만 확인합니다.
const body = vi.hoisted(() => ({ props: null as null | Record<string, unknown> }));
vi.mock("next/dynamic", () => ({
  default: () => (props: Record<string, unknown>) => { body.props = props; return <div>BlockNote 본문</div>; },
}));
const mocks = vi.hoisted(() => ({ useSession: vi.fn(), publishDocument: vi.fn() }));
vi.mock("../session/useCareerEditorSession", () => ({
  useCareerEditorSession: (recordId: string) => mocks.useSession(recordId),
}));

import { CareerDocumentEditor } from "./CareerDocumentEditor";

const record = { id: "11111111-1111-4111-8111-111111111111", bodyMd: "## 배경\n\n지난 본문입니다." } as CareerRecordListItem;
const session = (status: string, yDocument: Y.Doc | null) => ({
  snapshot: { status, documentVersion: 1, lastAckSequence: 1, proposal: null },
  document: yDocument ? createEmptyCareerDocument() : null,
  yDocument,
  publishDocument: mocks.publishDocument,
});

describe("CareerDocumentEditor", () => {
  afterEach(cleanup);
  beforeEach(() => { body.props = null; mocks.publishDocument.mockReset(); });

  it("says the record is missing instead of opening the editor when the document session is unavailable", () => {
    mocks.useSession.mockReturnValue(session("unavailable", null));
    render(<CareerDocumentEditor recordId={record.id} mode="page" record={record} />);
    expect(screen.getByText("이 기록을 찾을 수 없습니다. 삭제되었거나 다른 계정의 기록입니다.")).toBeTruthy();
    expect(screen.queryByText("BlockNote 본문")).toBeNull();
    expect(screen.queryByText("지난 본문입니다.")).toBeNull();
  });

  it("waits for the document session before mounting the editor", () => {
    mocks.useSession.mockReturnValue(session("loading", null));
    render(<CareerDocumentEditor recordId={record.id} mode="peek" />);
    expect(screen.getByText("문서를 불러오고 있습니다.")).toBeTruthy();
    expect(body.props).toBeNull();
  });

  it("mounts BlockNote on the session Y.Doc and publishes document copies to the session", () => {
    const yDocument = new Y.Doc();
    mocks.useSession.mockReturnValue(session("saved", yDocument));
    render(<CareerDocumentEditor recordId={record.id} mode="page" />);
    expect(screen.getByText("BlockNote 본문")).toBeTruthy();
    expect(body.props?.["yDocument"]).toBe(yDocument);
    expect(body.props?.["onDocumentChange"]).toBe(mocks.publishDocument);
    expect(typeof body.props?.["onAiRequest"]).toBe("function");
  });

  it("shows the save state above the body only on the full page", () => {
    mocks.useSession.mockReturnValue(session("offline", new Y.Doc()));
    const { unmount } = render(<CareerDocumentEditor recordId={record.id} mode="page" />);
    expect(screen.getByRole("status").textContent).toBe("오프라인");
    unmount();
    render(<CareerDocumentEditor recordId={record.id} mode="peek" showAiProposal={false} />);
    expect(screen.queryByRole("status")).toBeNull();
  });
});
