import { describe, expect, it } from "vitest";

import { blockNoteText, careerDocumentText, careerDocumentToBlockNote } from "./blocknote.js";
import type { CareerBlock, CareerDocument } from "./document.js";

const id = () => crypto.randomUUID();
const text = (type: string, value: string, attrs: Record<string, unknown> = {}): CareerBlock => ({ id: id(), type, attrs, text: [{ text: value }] });
const doc = (...content: CareerBlock[]): CareerDocument => ({ schemaVersion: 1, type: "doc", content });

describe("careerDocumentToBlockNote", () => {
  it("maps every v1 block type in the design set", () => {
    const source = doc(
      text("paragraph", "문단"),
      text("heading2", "제목"),
      { id: id(), type: "bulletList", attrs: {}, content: [text("listItem", "글머리"), { id: id(), type: "listItem", attrs: {}, content: [{ id: id(), type: "paragraph", attrs: {}, text: [{ text: "자식 문단" }] }, { id: id(), type: "bulletList", attrs: {}, content: [text("listItem", "중첩")] }] }] },
      { id: id(), type: "orderedList", attrs: {}, content: [text("listItem", "번호")] },
      { id: id(), type: "taskList", attrs: {}, content: [text("listItem", "할 일", { checked: true })] },
      text("blockquote", "인용"),
      text("code", "const a = 1;", { language: "ts" }),
      { id: id(), type: "horizontalRule", attrs: {} },
      text("callout", "콜아웃"),
      { id: id(), type: "image", attrs: { mediaId: "m1", alt: "그림" } },
    );
    const { blocks, degraded } = careerDocumentToBlockNote(source);
    expect(blocks.map((block) => block.type)).toEqual([
      "paragraph", "heading", "bulletListItem", "bulletListItem", "numberedListItem", "checkListItem",
      "quote", "codeBlock", "divider", "callout", "image",
    ]);
    expect(blocks[1]?.props).toEqual({ level: 2 });
    expect(blocks[3]?.children?.[0]?.type).toBe("bulletListItem");
    expect(blocks[5]?.props).toEqual({ checked: true });
    expect(blocks[10]?.props).toEqual({ url: "/v1/media/m1", caption: "그림" });
    expect(degraded).toEqual({});
    expect(blockNoteText(blocks)).toBe(careerDocumentText(source));
  });

  it("keeps a header row and inline marks", () => {
    const cell = (type: string, value: string): CareerBlock => ({ id: id(), type, attrs: {}, content: [{ id: id(), type: "paragraph", attrs: {}, text: [{ text: value }] }] });
    const source = doc(
      { id: id(), type: "table", attrs: {}, content: [
        { id: id(), type: "tableRow", attrs: {}, content: [cell("tableHeader", "머리"), cell("tableHeader", "글")] },
        { id: id(), type: "tableRow", attrs: {}, content: [cell("tableCell", "값1"), cell("tableCell", "값2")] },
      ] },
      { id: id(), type: "paragraph", attrs: {}, text: [{ text: "굵게", marks: [{ type: "bold" }] }, { text: "링크", marks: [{ type: "link", attrs: { href: "https://e.x" } }] }] },
    );
    const { blocks } = careerDocumentToBlockNote(source);
    expect(blocks[0]?.content).toMatchObject({ type: "tableContent", headerRows: 1, rows: [{ cells: [[{ text: "머리" }], [{ text: "글" }]] }, { cells: [[{ text: "값1" }], [{ text: "값2" }]] }] });
    expect(blocks[1]?.content).toEqual([
      { type: "text", text: "굵게", styles: { bold: true } },
      { type: "link", href: "https://e.x", content: [{ type: "text", text: "링크", styles: {} }] },
    ]);
  });

  it("degrades unknown blocks to paragraphs and counts them", () => {
    const { blocks, degraded } = careerDocumentToBlockNote(doc(text("evidence", "근거 문장", { source: "job:1" }), text("future.widget", "미래")));
    expect(blocks.map((block) => block.content)).toEqual(["근거 문장", "미래"]);
    expect(degraded).toEqual({ evidence: 1, "future.widget": 1 });
  });
});
