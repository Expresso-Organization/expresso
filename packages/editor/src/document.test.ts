import { describe, expect, it } from "vitest";
import { CAREER_BLOCK_TYPES, CareerDocumentSchema, createEmptyCareerDocument, parseCareerDocument } from "./document.js";

describe("career document", () => {
  it("accepts every initial block, inline mark, and unknown compatibility block", () => {
    const document = createEmptyCareerDocument();
    document.content = [...CAREER_BLOCK_TYPES, "futureWidget"].map((type) => ({
      id: crypto.randomUUID(), type, attrs: type === "futureWidget" ? { original: { version: 2 } } : {},
      text: [{ text: "content", marks: [{ type: "bold" }, { type: "link", attrs: { href: "https://example.com" } }] }],
    }));
    expect(parseCareerDocument(document).content.at(-1)?.attrs).toEqual({ original: { version: 2 } });
  });

  it("rejects duplicate IDs anywhere in the tree", () => {
    const document = createEmptyCareerDocument();
    document.content[0]!.content = [{ ...document.content[0]!, content: undefined }];
    expect(() => CareerDocumentSchema.parse(document)).toThrow(/duplicate block id/);
  });

  it("enforces depth and total block limits", () => {
    const deep = createEmptyCareerDocument();
    let cursor = deep.content[0]!;
    for (let depth = 0; depth < 33; depth += 1) {
      const child = { id: crypto.randomUUID(), type: "paragraph", attrs: {}, text: [] };
      cursor.content = [child]; cursor = child;
    }
    expect(() => CareerDocumentSchema.parse(deep)).toThrow(/nesting/);
    const wide = createEmptyCareerDocument();
    wide.content = Array.from({ length: 20_001 }, () => ({ id: crypto.randomUUID(), type: "paragraph", attrs: {}, text: [] }));
    expect(() => CareerDocumentSchema.parse(wide)).toThrow();
  });
});
