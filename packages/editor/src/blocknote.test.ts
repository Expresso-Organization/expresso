import { describe, expect, it } from "vitest";

import { blockNoteText, blockNoteToCareerDocument, careerDocumentText, careerDocumentToBlockNote, deterministicUuid } from "./blocknote.js";
import { parseCareerDocument, type CareerBlock, type CareerDocument } from "./document.js";

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

  it("keeps evidence blocks with their source and degrades unknown blocks", () => {
    const { blocks, degraded } = careerDocumentToBlockNote(doc(text("evidence", "근거 문장", { source: "job:1" }), text("future.widget", "미래")));
    expect(blocks.map((block) => [block.type, block.props?.["source"] ?? null])).toEqual([["evidence", "job:1"], ["paragraph", null]]);
    expect(degraded).toEqual({ "future.widget": 1 });
    const back = blockNoteToCareerDocument(blocks);
    expect(back.content[0]).toMatchObject({ type: "evidence", attrs: { source: "job:1" }, text: [{ text: "근거 문장" }] });
  });
});

describe("blockNoteToCareerDocument", () => {
  it("keeps block ids and groups list items under a stable list id", () => {
    const listItemId = id();
    const source = doc(
      text("paragraph", "문단"),
      { id: id(), type: "bulletList", attrs: {}, content: [{ id: listItemId, type: "listItem", attrs: {}, text: [{ text: "항목" }] }] },
      { id: id(), type: "taskList", attrs: {}, content: [text("listItem", "끝", { checked: true })] },
    );
    const first = blockNoteToCareerDocument(careerDocumentToBlockNote(source).blocks);
    const second = blockNoteToCareerDocument(careerDocumentToBlockNote(source).blocks);
    expect(first.content.map((block) => block.type)).toEqual(["paragraph", "bulletList", "taskList"]);
    expect(first.content[0]?.id).toBe(source.content[0]?.id);
    expect(first.content[1]?.content?.[0]?.id).toBe(listItemId);
    expect(first.content[1]?.id).toBe(second.content[1]?.id);
    expect(first.content[2]?.content?.[0]?.attrs).toEqual({ checked: true });
  });

  it("maps styles, links, header rows and media back", () => {
    const blocks = [
      { id: id(), type: "paragraph", content: [{ type: "text", text: "밑줄", styles: { underline: true, textColor: "red" } }, { type: "link", href: "https://e.x", content: [{ type: "text", text: "링크", styles: {} }] }] },
      { id: id(), type: "table", content: { type: "tableContent", headerRows: 1, rows: [{ cells: [[{ type: "text", text: "머리", styles: {} }]] }, { cells: [{ type: "tableCell", content: [{ type: "text", text: "값", styles: {} }] }] }] } },
      { id: id(), type: "image", props: { url: "/v1/media/11111111-1111-4111-8111-111111111111", caption: "그림" } },
    ];
    const result = blockNoteToCareerDocument(blocks);
    expect(result.content[0]?.text).toEqual([{ text: "밑줄", marks: [{ type: "underline" }] }, { text: "링크", marks: [{ type: "link", attrs: { href: "https://e.x" } }] }]);
    expect(result.content[1]?.content?.map((row) => row.content?.map((cell) => `${cell.type}:${cell.text?.[0]?.text}`))).toEqual([["tableHeader:머리"], ["tableCell:값"]]);
    expect(result.content[2]?.attrs).toEqual({ mediaId: "11111111-1111-4111-8111-111111111111", alt: "그림" });
    // 계약(UUID · 중복 없는 ID)을 통과해야 AI 제안 · 비교 화면이 읽을 수 있습니다.
    expect(() => parseCareerDocument(result)).not.toThrow();
  });

  it("makes valid and repeatable ids", () => {
    expect(deterministicUuid("a")).toBe(deterministicUuid("a"));
    expect(deterministicUuid("a")).not.toBe(deterministicUuid("b"));
    expect(deterministicUuid("a")).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
