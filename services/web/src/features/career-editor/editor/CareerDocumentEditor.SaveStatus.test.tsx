// @vitest-environment jsdom
import { createEmptyCareerDocument } from "@expresso/editor";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { CareerEditorSnapshot } from "../session/useCareerEditorSession";

vi.mock("@/features/agent-chat/AgentChat", () => ({ AgentChat: () => null }));
const mocks = vi.hoisted(() => ({ useSession: vi.fn() }));
vi.mock("../session/useCareerEditorSession", () => ({ useCareerEditorSession: () => mocks.useSession() }));
import { CareerDocumentEditor } from "./CareerDocumentEditor";
afterEach(cleanup);

it("reports every body session status without adding a redundant editor status bar", () => {
  let current: CareerEditorSnapshot["status"] = "loading";
  const document = createEmptyCareerDocument();
  mocks.useSession.mockImplementation(() => ({ snapshot: { status: current, documentVersion: 1, lastAckSequence: 1, proposal: null }, document, updateDocument: vi.fn() }));
  const changes: CareerEditorSnapshot["status"][] = [];
  const props = { recordId: "00000000-0000-4000-8000-000000000001", mode: "peek" as const, onSaveStatusChange: (status: CareerEditorSnapshot["status"]) => changes.push(status) };
  const view = render(<CareerDocumentEditor {...props} />);
  for (const next of ["saving", "offline", "conflict", "saved"] as const) { current = next; view.rerender(<CareerDocumentEditor {...props} />); }
  expect(changes).toEqual(["loading", "saving", "offline", "conflict", "saved"]);
  expect(screen.queryByRole("status", { name: "본문 저장 상태" })).toBeNull();
});
