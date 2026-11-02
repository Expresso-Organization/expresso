import { encodeDocumentAsYUpdate as encodeLegacy, reconstructYDocument as restoreLegacy, type CareerDocument } from "@expresso/editor";
import { BLOCKNOTE_FRAGMENT, blockNoteToCareerDocument, careerDocumentToBlockNote } from "@expresso/editor/blocknote";
import type { CareerDocumentBootstrap } from "@expresso/contracts";
import * as Y from "yjs";
import { restoreBlockNote, syncBlockNoteDocument } from "../../src/modules/career-editor/blocknote-document.js";

/** 실제 bootstrap이 제공한 문서 형식의 CRDT 상태로 클라이언트를 시작합니다. */
export function documentState(bootstrap: CareerDocumentBootstrap): Uint8Array {
  const state = bootstrap.stateBase64 ?? bootstrap.stateUpdateBase64;
  return state ? Buffer.from(state, "base64") : encodeLegacy(bootstrap.document);
}
function native(updates: readonly Uint8Array[]) {
  const document = new Y.Doc();
  for (const update of updates) Y.applyUpdate(document, update);
  return document.share.has(BLOCKNOTE_FRAGMENT);
}
export function encodeDocumentAsYUpdate(document: CareerDocument, previous: readonly Uint8Array[] = [], actor?: string): Uint8Array {
  if (!previous.length || !native(previous)) return encodeLegacy(document, previous, actor);
  return syncBlockNoteDocument(previous[0]!, previous.slice(1), careerDocumentToBlockNote(document).blocks).update;
}
export function reconstructYDocument(updates: readonly Uint8Array[]): CareerDocument {
  return native(updates) ? blockNoteToCareerDocument(restoreBlockNote(updates[0]!, updates.slice(1)).blocks) : restoreLegacy(updates);
}
