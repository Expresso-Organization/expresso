// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ status: "saved", documentVersion: 7 }));
vi.mock("../session/useCareerEditorSession", () => ({
  useCareerEditorSession: () => ({ snapshot: { status: mocks.status, documentVersion: mocks.documentVersion, lastAckSequence: 7, proposal: null } }),
}));

import { RevisionHistory, revisionLabel } from "./RevisionHistory";

const recordId = "11111111-1111-4111-8111-111111111111";
const row = (id: string, actor: "user" | "ai", summary: string) => ({
  id, recordId, actor, summary, beforeVersion: 1, afterVersion: 2,
  snapshotId: "22222222-2222-4222-8222-222222222222", createdAt: "2026-10-28T03:04:00.000Z",
});
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("RevisionHistory", () => {
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(() => { mocks.status = "saved"; fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("names rows by the moment the snapshot holds", () => {
    expect(revisionLabel({ actor: "ai", summary: "문장 다듬기" })).toBe("AI 적용 전");
    expect(revisionLabel({ actor: "user", summary: "리비전 복원" })).toBe("복원");
    expect(revisionLabel({ actor: "user", summary: "편집" })).toBe("편집");
  });

  it("loads revisions on open and restores one at the current document version", async () => {
    const edit = row("33333333-3333-4333-8333-333333333333", "user", "편집");
    fetchMock
      .mockResolvedValueOnce(json({ data: [edit, row("44444444-4444-4444-8444-444444444444", "ai", "요약")] }))
      .mockResolvedValueOnce(json({ documentVersion: 8 }))
      .mockResolvedValueOnce(json({ data: [row("55555555-5555-4555-8555-555555555555", "user", "리비전 복원"), edit] }));
    render(<RevisionHistory recordId={recordId} />);
    fireEvent.click(screen.getByRole("button", { name: "이력" }));
    expect(await screen.findByText("편집")).toBeTruthy();
    expect(screen.getByText("AI 적용 전")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "복원" })[0]!);
    expect(await screen.findByText("복원", { selector: "span" })).toBeTruthy();
    const [url, init] = fetchMock.mock.calls[1]!;
    expect(url).toBe(`/api/career/records/${recordId}/revisions/${edit.id}/restore`);
    expect(JSON.parse(String(init?.body))).toEqual({ expectedVersion: 7 });
  });

  it("reloads the list when the restore loses a version race", async () => {
    const edit = row("33333333-3333-4333-8333-333333333333", "user", "편집");
    fetchMock.mockResolvedValueOnce(json({ data: [edit] })).mockResolvedValueOnce(new Response(null, { status: 409 })).mockResolvedValueOnce(json({ data: [edit] }));
    render(<RevisionHistory recordId={recordId} />);
    fireEvent.click(screen.getByRole("button", { name: "이력" }));
    fireEvent.click(await screen.findByRole("button", { name: "복원" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock.mock.calls[2]![0]).toBe(`/api/career/records/${recordId}/revisions`);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("keeps restore disabled while edits are still saving", async () => {
    mocks.status = "saving";
    fetchMock.mockResolvedValueOnce(json({ data: [row("33333333-3333-4333-8333-333333333333", "user", "편집")] }));
    render(<RevisionHistory recordId={recordId} />);
    fireEvent.click(screen.getByRole("button", { name: "이력" }));
    expect((await screen.findByRole("button", { name: "복원" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
