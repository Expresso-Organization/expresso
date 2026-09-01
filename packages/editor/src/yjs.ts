import * as Y from "yjs";
import { parseCareerDocument, type CareerDocument } from "./document.js";

const DOCUMENT_MAP = "expresso-career-document";
export function encodeDocumentAsYUpdate(document: CareerDocument): Uint8Array {
  const yDocument = new Y.Doc();
  yDocument.getMap<string>(DOCUMENT_MAP).set("json", JSON.stringify(parseCareerDocument(document)));
  return Y.encodeStateAsUpdate(yDocument);
}
export function decodeYDocument(update: Uint8Array): CareerDocument {
  const yDocument = new Y.Doc();
  Y.applyUpdate(yDocument, update);
  const value = yDocument.getMap<string>(DOCUMENT_MAP).get("json");
  if (!value) throw new Error("missing career document");
  return parseCareerDocument(JSON.parse(value));
}
