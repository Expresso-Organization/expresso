import * as Y from "yjs";
import { parseCareerDocument, type CareerDocument } from "./document.js";

const DOCUMENT_MAP = "expresso-career-document";

function stableClientId(canonicalJson: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < canonicalJson.length; index += 1) {
    hash ^= canonicalJson.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0) || 1;
}

export function encodeDocumentAsYUpdate(document: CareerDocument, baseUpdates: readonly Uint8Array[] = []): Uint8Array {
  const canonicalJson = JSON.stringify(parseCareerDocument(document));
  const yDocument = new Y.Doc();
  // JSON snapshot을 다시 열어도 같은 Yjs base identity를 만들어 pending update의 인과 기준을 유지합니다.
  yDocument.clientID = stableClientId(canonicalJson);
  for (const update of baseUpdates) Y.applyUpdate(yDocument, update);
  yDocument.getMap<string>(DOCUMENT_MAP).set("json", canonicalJson);
  return Y.encodeStateAsUpdate(yDocument);
}

export function encodeDocumentStateVector(document: CareerDocument): Uint8Array {
  const yDocument = new Y.Doc();
  Y.applyUpdate(yDocument, encodeDocumentAsYUpdate(document));
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
