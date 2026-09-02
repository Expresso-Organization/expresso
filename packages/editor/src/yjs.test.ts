import { describe, expect, it } from "vitest";
import { createEmptyCareerDocument, encodeDocumentAsYUpdate, reconstructYDocument } from "./index.js";

describe("Yjs reconstruction", () => {
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
