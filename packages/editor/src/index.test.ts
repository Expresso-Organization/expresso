import { expect, test } from "vitest";
import {
  PACKAGE_BOUNDARY,
  createEmptyCareerDocument,
  decodeYDocument,
  encodeDocumentAsYUpdate,
} from "./index.js";

test("exposes package boundary", () => expect(PACKAGE_BOUNDARY).toBe("@expresso/editor"));

test("round trips the canonical document through Yjs", () => {
  const document = createEmptyCareerDocument();
  expect(decodeYDocument(encodeDocumentAsYUpdate(document))).toEqual(document);
});
