import { describe, expect, it, vi } from "vitest";

vi.mock("node:crypto", () => ({ randomUUID: undefined }));

import { CareerDocumentSchema, createEmptyCareerDocument } from "./document.js";

describe("career document browser compatibility", () => {
  it("node:crypto 없이도 유효한 UUID를 가진 빈 문서를 만든다", () => {
    const document = createEmptyCareerDocument();

    expect(CareerDocumentSchema.parse(document)).toEqual(document);
    expect(document.content[0]?.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});
