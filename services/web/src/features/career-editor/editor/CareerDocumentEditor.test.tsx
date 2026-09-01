// @vitest-environment jsdom

import { createEmptyCareerDocument, parseCareerDocument } from "@expresso/editor";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ useSession: vi.fn(), updateDocument: vi.fn() }));
vi.mock("../session/useCareerEditorSession", () => ({
  useCareerEditorSession: (recordId: string) => mocks.useSession(recordId),
}));

import { CareerDocumentEditor } from "./CareerDocumentEditor";
import { careerDocumentToTiptap, tiptapToCareerDocument } from "./extensions";

describe("CareerDocumentEditor", () => {
  afterEach(cleanup);
  beforeEach(() => {
    mocks.updateDocument.mockReset();
    mocks.useSession.mockReturnValue({
      snapshot: { status: "saved", documentVersion: 1, lastAckSequence: 1, proposal: null },
      document: createEmptyCareerDocument(),
      updateDocument: mocks.updateDocument,
    });
  });

  it("preserves nested and unknown neutral blocks through the Tiptap boundary", () => {
    const unknown = { id: crypto.randomUUID(), type: "futureWidget", attrs: { version: 2 }, text: [{ text: "future" }] };
    const document = parseCareerDocument({
      schemaVersion: 1,
      type: "doc",
      content: [
        { id: crypto.randomUUID(), type: "bulletList", attrs: {}, content: [{ id: crypto.randomUUID(), type: "listItem", attrs: {}, text: [{ text: "항목" }] }] },
        unknown,
      ],
    });
    const result = tiptapToCareerDocument(careerDocumentToTiptap(document));
    expect(result.content[0]?.type).toBe("bulletList");
    expect(result.content[1]).toEqual(unknown);
  });

  it("repairs duplicated career IDs created by split or paste before serialization", () => {
    const duplicate = crypto.randomUUID();
    const result = tiptapToCareerDocument({ type: "doc", content: [
      { type: "paragraph", attrs: { careerId: duplicate }, content: [{ type: "text", text: "첫째" }] },
      { type: "paragraph", attrs: { careerId: duplicate }, content: [{ type: "text", text: "둘째" }] },
    ] });
    expect(result.content[0]?.id).toBe(duplicate);
    expect(result.content[1]?.id).not.toBe(duplicate);
  });

  it("opens the keyboard slash menu and restores focus on escape", async () => {
    render(<CareerDocumentEditor recordId="11111111-1111-4111-8111-111111111111" mode="peek" />);
    const editor = await screen.findByLabelText("커리어 기록 본문");
    fireEvent.keyDown(editor, { key: "/" });
    expect(await screen.findByRole("menu", { name: "블록 명령" })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: /본문/ }));
    fireEvent.keyDown(screen.getByRole("menu", { name: "블록 명령" }), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("menu", { name: "블록 명령" })).toBeNull());
  });

  it("exposes save state and accessible formatting controls", async () => {
    render(<CareerDocumentEditor recordId="11111111-1111-4111-8111-111111111111" mode="page" />);
    expect((await screen.findByRole("status")).textContent).toContain("저장됨");
    expect(screen.getByRole("toolbar", { name: "텍스트 서식" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "굵게" }).getAttribute("aria-pressed")).toBe("false");
  });
});
