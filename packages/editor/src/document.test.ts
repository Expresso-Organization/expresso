import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CAREER_BLOCK_TYPES, CareerDocumentSchema, createEmptyCareerDocument, parseCareerDocument } from "./document.js";

const richFixtures = JSON.parse(
  readFileSync(
    new URL("../../contracts/openapi/fixtures/career-rich-block-body-v1.json", import.meta.url),
    "utf8",
  ),
) as Record<string, unknown>;

const blockId = "50000000-0000-4000-8000-000000000001";
const childBlockId = "50000000-0000-4000-8000-000000000002";

function documentWithBlock(block: Record<string, unknown>): Record<string, unknown> {
  return { schemaVersion: 1, type: "doc", content: [{ id: blockId, attrs: {}, ...block }] };
}

function nestedJsonObject(depth: number): Record<string, unknown> {
  let value: Record<string, unknown> = {};
  for (let currentDepth = 1; currentDepth < depth; currentDepth += 1) value = { nested: value };
  return value;
}

describe("career document", () => {
  it("accepts and preserves the shared rich document corpus", () => {
    for (const fixture of Object.values(richFixtures)) {
      expect(parseCareerDocument(fixture)).toEqual(fixture);
    }
  });

  it("accepts empty root content and text spans up to 200000 Unicode code points", () => {
    expect(parseCareerDocument({ schemaVersion: 1, type: "doc", content: [] }).content).toEqual([]);
    const document = documentWithBlock({ type: "paragraph", text: [{ text: "😀".repeat(200_000) }] });
    expect(() => parseCareerDocument(document)).not.toThrow();
    expect(() => parseCareerDocument(documentWithBlock({
      type: "paragraph", text: [{ text: "😀".repeat(200_001) }],
    }))).toThrow();
  });

  it("accepts 20 marks and rejects 21 marks on one text span", () => {
    const marks = Array.from({ length: 20 }, () => ({ type: "bold" }));
    expect(() => parseCareerDocument(documentWithBlock({ type: "paragraph", text: [{ text: "본문", marks }] }))).not.toThrow();
    expect(() => parseCareerDocument(documentWithBlock({
      type: "paragraph", text: [{ text: "본문", marks: [...marks, { type: "italic" }] }],
    }))).toThrow();
  });

  it.each([
    ["known block의 sourceMarkdown 타입", { type: "paragraph", attrs: { sourceMarkdown: 1 } }],
    ["paragraph의 중첩 content", { type: "paragraph", content: [{ id: childBlockId, type: "paragraph", attrs: {} }] }],
    ["code의 language 타입", { type: "code", attrs: { language: 1 } }],
    ["list의 직접 text", { type: "bulletList", text: [{ text: "허용 안 됨" }] }],
    ["list의 잘못된 자식", { type: "orderedList", content: [{ id: childBlockId, type: "paragraph", attrs: {} }] }],
    ["listItem의 non-empty content와 text 동시 사용", {
      type: "listItem",
      content: [{ id: childBlockId, type: "paragraph", attrs: {} }],
      text: [{ text: "중복 본문" }],
    }],
    ["listItem의 checked 타입", { type: "listItem", attrs: { checked: "yes" } }],
    ["callout의 icon 타입", { type: "callout", attrs: { icon: 1 } }],
    ["horizontalRule의 직접 text", { type: "horizontalRule", text: [{ text: "허용 안 됨" }] }],
    ["image의 누락된 mediaId", { type: "image" }],
    ["file의 누락된 name", { type: "file", attrs: { mediaId: "media-1" } }],
    ["table의 잘못된 자식", { type: "table", content: [{ id: childBlockId, type: "paragraph", attrs: {} }] }],
    ["tableRow의 잘못된 자식", { type: "tableRow", content: [{ id: childBlockId, type: "paragraph", attrs: {} }] }],
    ["tableCell의 non-empty content와 text 동시 사용", {
      type: "tableCell",
      content: [{ id: childBlockId, type: "paragraph", attrs: {} }],
      text: [{ text: "중복 본문" }],
    }],
    ["evidence의 누락된 source", { type: "evidence" }],
    ["link mark의 누락된 href", { type: "paragraph", text: [{ text: "링크", marks: [{ type: "link" }] }] }],
  ])("rejects %s", (_caseName, block) => {
    expect(() => parseCareerDocument(documentWithBlock(block))).toThrow();
  });

  it("preserves an unknown block without applying known block content rules", () => {
    const fixture = richFixtures.unknownBlock;
    expect(parseCareerDocument(fixture)).toEqual(fixture);
  });

  it("rejects block attrs deeper than 16", () => {
    expect(() => parseCareerDocument(documentWithBlock({ type: "paragraph", attrs: nestedJsonObject(16) }))).not.toThrow();
    expect(() => parseCareerDocument(documentWithBlock({ type: "paragraph", attrs: nestedJsonObject(17) }))).toThrow();
  });

  it("rejects mark attrs deeper than 16", () => {
    expect(() => parseCareerDocument(documentWithBlock({
      type: "paragraph",
      text: [{ text: "본문", marks: [{ type: "bold", attrs: nestedJsonObject(16) }] }],
    }))).not.toThrow();
    expect(() => parseCareerDocument(documentWithBlock({
      type: "paragraph",
      text: [{ text: "본문", marks: [{ type: "bold", attrs: nestedJsonObject(17) }] }],
    }))).toThrow();
  });

  it("accepts block attrs at 65536 compact UTF-8 bytes and rejects one byte more", () => {
    expect(() => parseCareerDocument(documentWithBlock({
      type: "future.block", attrs: { value: "x".repeat(65_524) },
    }))).not.toThrow();
    expect(() => parseCareerDocument(documentWithBlock({
      type: "future.block", attrs: { value: "x".repeat(65_525) },
    }))).toThrow();
  });

  it("accepts mark attrs at 8192 compact UTF-8 bytes and rejects one byte more", () => {
    const documentWithMarkAttrs = (valueLength: number) => documentWithBlock({
      type: "paragraph",
      text: [{ text: "본문", marks: [{ type: "bold", attrs: { value: "x".repeat(valueLength) } }] }],
    });
    expect(() => parseCareerDocument(documentWithMarkAttrs(8_180))).not.toThrow();
    expect(() => parseCareerDocument(documentWithMarkAttrs(8_181))).toThrow();
  });

  it("rejects a compact canonical document larger than 4 MiB", () => {
    const text = Array.from({ length: 29 }, () => ({ text: "가".repeat(49_000) }));
    expect(() => parseCareerDocument(documentWithBlock({ type: "paragraph", text }))).toThrow();
  });

  it("accepts every initial block, inline mark, and unknown compatibility block", () => {
    const document = createEmptyCareerDocument();
    document.content = [...CAREER_BLOCK_TYPES, "futureWidget"].map((type) => {
      const attrs = type === "image"
        ? { mediaId: "media-1" }
        : type === "file"
          ? { mediaId: "media-2", name: "resume.pdf" }
          : type === "evidence"
            ? { source: "portfolio" }
            : type === "futureWidget"
              ? { original: { version: 2 } }
              : {};
      const text = type === "paragraph"
        ? [{ text: "content", marks: [{ type: "bold" as const }, { type: "link" as const, attrs: { href: "https://example.com" } }] }]
        : undefined;
      return { id: crypto.randomUUID(), type, attrs, text };
    });
    expect(parseCareerDocument(document).content.at(-1)?.attrs).toEqual({ original: { version: 2 } });
  });

  it("rejects duplicate IDs anywhere in the tree", () => {
    const document = createEmptyCareerDocument();
    document.content[0]!.content = [{ ...document.content[0]!, content: undefined }];
    expect(() => CareerDocumentSchema.parse(document)).toThrow(/duplicate block id/);
  });

  it("enforces depth and total block limits", () => {
    const deep = createEmptyCareerDocument();
    deep.content[0]!.type = "future.container";
    let cursor = deep.content[0]!;
    for (let depth = 1; depth < 32; depth += 1) {
      const child = { id: crypto.randomUUID(), type: "future.container", attrs: {}, text: [] };
      cursor.content = [child]; cursor = child;
    }
    expect(() => CareerDocumentSchema.parse(deep)).not.toThrow();
    cursor.content = [{ id: crypto.randomUUID(), type: "future.container", attrs: {}, text: [] }];
    expect(() => CareerDocumentSchema.parse(deep)).toThrow(/nesting/);

    const maximumBlockCount = createEmptyCareerDocument();
    maximumBlockCount.content = Array.from({ length: 10_000 }, () => ({
      id: crypto.randomUUID(), type: "future.container", attrs: {}, text: [],
      content: [{ id: crypto.randomUUID(), type: "paragraph", attrs: {}, text: [] }],
    }));
    expect(() => CareerDocumentSchema.parse(maximumBlockCount)).not.toThrow();
    maximumBlockCount.content.push({ id: crypto.randomUUID(), type: "paragraph", attrs: {}, text: [] });
    expect(() => CareerDocumentSchema.parse(maximumBlockCount)).toThrow(/too many blocks/);
  });
});
