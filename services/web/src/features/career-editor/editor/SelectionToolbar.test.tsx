// @vitest-environment jsdom

import type { Editor } from "@tiptap/react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SelectionToolbar } from "./SelectionToolbar";

function editor(empty: boolean): Editor {
  const chain = { focus: () => chain, toggleBold: () => chain, toggleItalic: () => chain, toggleStrike: () => chain, toggleCode: () => chain, extendMarkRange: () => chain, setLink: () => chain, unsetLink: () => chain, run: () => true };
  return { state: { selection: { empty, from: 1, to: 2 }, doc: { nodesBetween: (_from: number, _to: number, visit: (node: { attrs: { careerId: string } }) => void) => visit({ attrs: { careerId: "00000000-0000-4000-8000-000000000001" } }) } }, isActive: () => false, chain: () => chain, getAttributes: () => ({}), on: () => undefined, off: () => undefined } as unknown as Editor;
}

describe("SelectionToolbar", () => {
  afterEach(cleanup);
  it("reveals AI actions only for a text selection and sends the chosen instruction", () => {
    const onAiRequest = vi.fn();
    render(<SelectionToolbar editor={editor(true)} onAiRequest={onAiRequest} />);
    expect(screen.getByRole("button", { name: "AI 편집" }).hasAttribute("disabled")).toBe(true);
    cleanup();
    render(<SelectionToolbar editor={editor(false)} onAiRequest={onAiRequest} />);
    fireEvent.click(screen.getByRole("button", { name: "AI 편집" }));
    fireEvent.click(screen.getByRole("button", { name: "짧게" }));
    expect(onAiRequest).toHaveBeenCalledWith(expect.stringContaining("짧게"), ["00000000-0000-4000-8000-000000000001"]);
  });
});
