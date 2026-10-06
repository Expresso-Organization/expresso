import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createEmptyCareerDocument, encodeDocumentAsYUpdate, parseCareerDocument, reconstructYDocument } from "./index.js";

const richFixtures = JSON.parse(
  readFileSync(
    new URL("../../contracts/openapi/fixtures/career-rich-block-body-v1.json", import.meta.url),
    "utf8",
  ),
) as Record<string, unknown>;

describe("Yjs reconstruction", () => {
  it.each(["richNested", "unknownBlock"])("round-trips the shared %s fixture without semantic loss", (fixtureName) => {
    const document = parseCareerDocument(richFixtures[fixtureName]);
    expect(reconstructYDocument([encodeDocumentAsYUpdate(document)])).toEqual(document);
  });

  it("recreates the same snapshot base from canonical JSON", () => {
    const document = createEmptyCareerDocument();
    expect(encodeDocumentAsYUpdate(document)).toEqual(encodeDocumentAsYUpdate(structuredClone(document)));
  });

  it("applies snapshot and updates cumulatively", () => {
    const first = createEmptyCareerDocument();
    const second = { ...first, content: [{ ...first.content[0]!, text: [{ text: "누적" }] }] };
    const snapshot = encodeDocumentAsYUpdate(first);
    const next = encodeDocumentAsYUpdate(second, [snapshot]);
    expect(reconstructYDocument([snapshot, next]).content[0]!.text?.[0]?.text).toBe("누적");
  });

  it("treats returning to an earlier JSON value as a new transition", () => {
    const first = createEmptyCareerDocument();
    first.content[0]!.text = [{ text: "처음" }];
    const second = structuredClone(first); second.content[0]!.text = [{ text: "변경" }];
    const snapshot = encodeDocumentAsYUpdate(first);
    const changed = encodeDocumentAsYUpdate(second, [snapshot], "user:1");
    const restored = encodeDocumentAsYUpdate(first, [snapshot, changed], "user:2");
    expect(reconstructYDocument([snapshot, changed, restored]).content[0]!.text?.[0]?.text).toBe("처음");
  });
});
