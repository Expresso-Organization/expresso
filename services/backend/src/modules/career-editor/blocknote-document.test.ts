import { blockNoteText, careerDocumentText } from "@expresso/editor/blocknote";
import type { CareerBlock, CareerDocument } from "@expresso/editor/document";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import { blockNoteMarkdown, careerDocumentToBlockNoteState, restoreBlockNote } from "./blocknote-document.js";

const id = () => crypto.randomUUID();
const cell = (type: string, value: string): CareerBlock => ({ id: id(), type, attrs: {}, content: [{ id: id(), type: "paragraph", attrs: {}, text: [{ text: value }] }] });
const source: CareerDocument = {
  schemaVersion: 1, type: "doc", content: [
    { id: id(), type: "heading1", attrs: {}, text: [{ text: "결제 장애 대응" }] },
    { id: id(), type: "paragraph", attrs: {}, text: [{ text: "첫 줄\n둘째 줄" }, { text: "굵게", marks: [{ type: "bold" }] }] },
    { id: id(), type: "table", attrs: {}, content: [
      { id: id(), type: "tableRow", attrs: {}, content: [cell("tableHeader", "지표"), cell("tableHeader", "값")] },
      { id: id(), type: "tableRow", attrs: {}, content: [cell("tableCell", "실패율"), cell("tableCell", "0%")] },
    ] },
    { id: id(), type: "bulletList", attrs: {}, content: [{ id: id(), type: "listItem", attrs: {}, text: [{ text: "트레이스 삽입" }] }] },
    { id: id(), type: "callout", attrs: {}, text: [{ text: "계측이 먼저" }] },
  ],
};

describe("BlockNote Yjs document", () => {
  it("restores the migrated state with header row, line break, list and callout", () => {
    const migrated = careerDocumentToBlockNoteState(source);
    const restored = restoreBlockNote(migrated.state);
    expect(restored.blocks.map((block) => block.type)).toEqual(["heading", "paragraph", "table", "bulletListItem", "callout"]);
    expect(restored.blocks[2]?.content).toMatchObject({ headerRows: 1 });
    expect(JSON.stringify(restored.blocks[1]?.content)).toContain("첫 줄\\n둘째 줄");
    expect(blockNoteText(restored.blocks)).toBe(careerDocumentText(source));
  });

  it("merges updates made from the stored state without duplicating content", () => {
    const migrated = careerDocumentToBlockNoteState(source);
    // 두 클라이언트가 같은 state에서 출발해 각자 다른 블록을 고칩니다.
    const left = new Y.Doc(); Y.applyUpdate(left, migrated.state);
    const right = new Y.Doc(); Y.applyUpdate(right, migrated.state);
    const textOf = (doc: Y.Doc, index: number) => {
      const group = doc.getXmlFragment("document-store").get(0) as Y.XmlElement;
      const container = group.get(index) as Y.XmlElement;
      return (container.get(0) as Y.XmlElement).get(0) as Y.XmlText;
    };
    const beforeLeft = Y.encodeStateVector(left);
    const beforeRight = Y.encodeStateVector(right);
    textOf(left, 0).insert(0, "[왼쪽]");
    textOf(right, 3).insert(0, "[오른쪽]");
    const restored = restoreBlockNote(migrated.state, [Y.encodeStateAsUpdate(left, beforeLeft), Y.encodeStateAsUpdate(right, beforeRight)]);
    const text = blockNoteText(restored.blocks);
    expect(text.startsWith("[왼쪽]결제장애대응")).toBe(true);
    expect(text).toContain("[오른쪽]트레이스삽입");
    expect(text.match(/결제장애대응/g)).toHaveLength(1);
  });

  it("projects Markdown for bodyMd", async () => {
    const markdown = await blockNoteMarkdown(careerDocumentToBlockNoteState(source).blocks);
    expect(markdown).toContain("# 결제 장애 대응");
    expect(markdown).toContain("**굵게**");
    expect(markdown).toMatch(/\| *지표 *\| *값 *\|/);
    expect(markdown).toContain("* 트레이스 삽입");
  });
});
