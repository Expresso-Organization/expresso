import { getSchema, type JSONContent } from "@tiptap/core";
import { Node } from "@tiptap/pm/model";
import { describe, expect, it } from "vitest";

import { careerDocumentToTiptap, careerEditorExtensions, tiptapToCareerDocument } from "./extensions";

const schema = getSchema(careerEditorExtensions);

// 저장 변환이 처리하는 노드 · mark 이름입니다. 편집기에 확장이 늘면 여기와 변환을 함께 고쳐야 합니다.
const HANDLED_NODES = [
  "doc", "text", "paragraph", "heading", "bulletList", "orderedList", "listItem", "taskList", "taskItem",
  "blockquote", "codeBlock", "horizontalRule", "hardBreak", "image", "table", "tableRow", "tableHeader",
  "tableCell", "careerCompatibility",
];
const HANDLED_MARKS = ["bold", "italic", "strike", "code", "link", "underline"];

const text = (value: string, marks?: JSONContent["marks"]): JSONContent => ({ type: "text", text: value, ...(marks ? { marks } : {}) });
const paragraph = (...content: JSONContent[]): JSONContent => ({ type: "paragraph", content });
const cell = (type: "tableHeader" | "tableCell", value: string): JSONContent => ({ type, content: [paragraph(text(value))] });

/** careerId는 저장 때마다 새로 붙을 수 있어 비교에서 뺍니다. */
function shape(node: JSONContent): JSONContent {
  const { careerId: _careerId, ...attrs } = node.attrs ?? {};
  return {
    ...(node.type ? { type: node.type } : {}),
    ...(Object.keys(attrs).length ? { attrs } : {}),
    ...(node.text !== undefined ? { text: node.text } : {}),
    ...(node.marks?.length ? { marks: node.marks.map((mark) => ({ type: mark.type, ...(mark.attrs ? { attrs: mark.attrs } : {}) })) } : {}),
    ...(node.content?.length ? { content: node.content.map(shape) } : {}),
  };
}

function roundTrip(content: JSONContent[]): JSONContent {
  const source = Node.fromJSON(schema, { type: "doc", content }).toJSON() as JSONContent;
  const reopened = careerDocumentToTiptap(tiptapToCareerDocument(source));
  const node = Node.fromJSON(schema, reopened);
  node.check();
  expect(shape(node.toJSON() as JSONContent)).toEqual(shape(source));
  return reopened;
}

describe("career editor save conversion", () => {
  it("handles every node and mark the editor schema can produce", () => {
    expect(Object.keys(schema.nodes).filter((name) => !HANDLED_NODES.includes(name))).toEqual([]);
    expect(Object.keys(schema.marks).filter((name) => !HANDLED_MARKS.includes(name))).toEqual([]);
  });

  it("keeps a table header row", () => {
    roundTrip([{ type: "table", content: [
      { type: "tableRow", content: [cell("tableHeader", "지표"), cell("tableHeader", "값")] },
      { type: "tableRow", content: [cell("tableCell", "실패율"), cell("tableCell", "0%")] },
    ] }]);
  });

  it("keeps hard breaks at their position between differently marked text", () => {
    roundTrip([paragraph(
      text("첫 줄"),
      { type: "hardBreak" },
      text("굵게", [{ type: "bold" }]),
      { type: "hardBreak" },
      text("링크", [{ type: "link", attrs: { href: "https://example.com", target: "_blank", rel: "noopener noreferrer nofollow", class: null, title: null } }]),
    )]);
  });

  it("keeps underline and the other inline marks", () => {
    roundTrip([paragraph(
      text("밑줄", [{ type: "underline" }]),
      text("기울임", [{ type: "italic" }]),
      text("취소", [{ type: "strike" }]),
      text("코드", [{ type: "code" }]),
    )]);
  });

  it("keeps lists, task items, quotes, code and headings", () => {
    roundTrip([
      { type: "heading", attrs: { level: 2 }, content: [text("제목")] },
      { type: "bulletList", content: [{ type: "listItem", content: [paragraph(text("항목")), { type: "bulletList", content: [{ type: "listItem", content: [paragraph(text("중첩"))] }] }] }] },
      { type: "orderedList", attrs: { start: 1, type: null }, content: [{ type: "listItem", content: [paragraph(text("번호"))] }] },
      { type: "taskList", content: [{ type: "taskItem", attrs: { checked: true }, content: [paragraph(text("할 일"))] }] },
      { type: "blockquote", content: [paragraph(text("인용"))] },
      { type: "codeBlock", attrs: { language: "ts" }, content: [text("const a = 1;")] },
      { type: "horizontalRule" },
    ]);
  });

  it("opens a document already saved with tableHeader blocks", () => {
    const id = () => crypto.randomUUID();
    const reopened = careerDocumentToTiptap({ schemaVersion: 1, type: "doc", content: [{ id: id(), type: "table", attrs: {}, content: [
      { id: id(), type: "tableRow", attrs: {}, content: [{ id: id(), type: "tableHeader", attrs: {}, content: [{ id: id(), type: "paragraph", attrs: {}, text: [{ text: "머리" }] }] }] },
    ] }] });
    expect(() => Node.fromJSON(schema, reopened).check()).not.toThrow();
  });
});
