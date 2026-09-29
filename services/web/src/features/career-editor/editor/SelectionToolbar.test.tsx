// @vitest-environment jsdom

import type { Editor } from "@tiptap/react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { SelectionToolbar } from "./SelectionToolbar";

function editor(empty: boolean): Editor {
  const chain = { focus: () => chain, toggleBold: () => chain, toggleItalic: () => chain, toggleStrike: () => chain, toggleCode: () => chain, extendMarkRange: () => chain, setLink: () => chain, unsetLink: () => chain, run: () => true };
  return { state: { selection: { empty, from: 1, to: 2 }, doc: { nodesBetween: (_from: number, _to: number, visit: (node: { attrs: { careerId: string } }) => void) => visit({ attrs: { careerId: "00000000-0000-4000-8000-000000000001" } }) } }, isActive: () => false, chain: () => chain, getAttributes: () => ({}), on: () => undefined, off: () => undefined } as unknown as Editor;
}

describe("SelectionToolbar", () => {
  afterEach(cleanup);
  it("keeps text formatting while hiding the AI edit entrypoint", () => {
    render(<SelectionToolbar editor={editor(false)} />);

    expect(screen.getByRole("toolbar", { name: "텍스트 서식" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "굵게" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "AI 편집" })).toBeNull();
  });
});
