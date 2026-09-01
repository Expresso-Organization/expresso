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
});
