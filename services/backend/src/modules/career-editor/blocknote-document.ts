import { ServerBlockNoteEditor } from "@blocknote/server-util";
import {
  BLOCKNOTE_FRAGMENT,
  careerBlockNoteSchema,
  careerDocumentToBlockNote,
  type CareerBlockNoteBlock,
} from "@expresso/editor/blocknote";
import type { CareerDocument } from "@expresso/editor/document";
import * as Y from "yjs";

let serverEditor: ServerBlockNoteEditor | undefined;
// 서버 편집기는 jsdom을 띄우므로 한 번만 만듭니다.
function editor(): ServerBlockNoteEditor {
  serverEditor ??= ServerBlockNoteEditor.create({ schema: careerBlockNoteSchema } as never);
  return serverEditor;
}

export interface BlockNoteState {
  blocks: CareerBlockNoteBlock[];
  /** Y.encodeStateAsUpdate 결과입니다. 스냅샷 state 필드에 그대로 저장합니다. */
  state: Uint8Array;
  degraded: Record<string, number>;
}

/** v1 문서를 BlockNote Yjs 상태로 옮깁니다. 블록 ID는 v1 블록 ID를 그대로 씁니다. */
export function careerDocumentToBlockNoteState(document: CareerDocument): BlockNoteState {
  const { blocks, degraded } = careerDocumentToBlockNote(document);
  const yDocument = editor().blocksToYDoc(blocks as never, BLOCKNOTE_FRAGMENT);
  return { blocks: restoreBlockNote(Y.encodeStateAsUpdate(yDocument)).blocks, state: Y.encodeStateAsUpdate(yDocument), degraded };
}

/** 스냅샷 state와 그 뒤 업데이트를 한 Y.Doc에 적용해 블록과 최신 상태를 돌려줍니다. */
export function restoreBlockNote(state: Uint8Array, updates: readonly Uint8Array[] = []): { blocks: CareerBlockNoteBlock[]; state: Uint8Array } {
  const yDocument = new Y.Doc();
  Y.applyUpdate(yDocument, state);
  for (const update of updates) Y.applyUpdate(yDocument, update);
  return {
    blocks: editor().yDocToBlocks(yDocument, BLOCKNOTE_FRAGMENT) as unknown as CareerBlockNoteBlock[],
    state: Y.encodeStateAsUpdate(yDocument),
  };
}

export function blockNoteMarkdown(blocks: readonly CareerBlockNoteBlock[]): Promise<string> {
  return editor().blocksToMarkdownLossy(blocks as never);
}

export function blockNoteStateVector(state: Uint8Array): Uint8Array {
  return Y.encodeStateVectorFromUpdate(state);
}
