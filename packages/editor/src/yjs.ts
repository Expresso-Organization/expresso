import * as Y from "yjs";
import { parseCareerDocument, type CareerDocument } from "./document.js";

const DOCUMENT_MAP = "expresso-career-document";
export function encodeDocumentAsYUpdate(document: CareerDocument, baseUpdates: readonly Uint8Array[] = []): Uint8Array {
  const yDocument = new Y.Doc();
  for (const update of baseUpdates) Y.applyUpdate(yDocument, update);
  yDocument.getMap<string>(DOCUMENT_MAP).set("json", JSON.stringify(parseCareerDocument(document)));
  return Y.encodeStateAsUpdate(yDocument);
}

export function encodeDocumentStateVector(document: CareerDocument): Uint8Array {
  const yDocument = new Y.Doc();
  yDocument.getMap<string>(DOCUMENT_MAP).set("json", JSON.stringify(parseCareerDocument(document)));
  return Y.encodeStateVector(yDocument);
}
export function decodeYDocument(update: Uint8Array): CareerDocument {
  const yDocument = new Y.Doc();
  Y.applyUpdate(yDocument, update);
  const value = yDocument.getMap<string>(DOCUMENT_MAP).get("json");
  if (!value) throw new Error("missing career document");
  return parseCareerDocument(JSON.parse(value));
}

/** 스냅샷과 증분 update를 같은 Y.Doc에 적용해 최종 문서를 복원합니다. */
export function reconstructYDocument(updates: readonly Uint8Array[]): CareerDocument {
  const yDocument = new Y.Doc();
  for (const update of updates) Y.applyUpdate(yDocument, update);
  const value = yDocument.getMap<string>(DOCUMENT_MAP).get("json");
  if (!value) throw new Error("missing career document");
  return parseCareerDocument(JSON.parse(value));
}
