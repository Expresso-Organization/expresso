import { ServerBlockNoteEditor } from "@blocknote/server-util";
import {
  BLOCKNOTE_FRAGMENT,
  careerBlockNoteSchema,
  careerDocumentToBlockNote,
  type CareerBlockNoteBlock,
} from "@expresso/editor/blocknote";
import type { CareerDocument } from "@expresso/editor/document";
import { markdownToCareerDocument } from "@expresso/editor";
import * as Y from "yjs";

const createEditor = () => ServerBlockNoteEditor.create({ schema: careerBlockNoteSchema } as never);
let serverEditor: ReturnType<typeof createEditor> | undefined;
// 서버 편집기는 jsdom을 띄우므로 한 번만 만듭니다.
function editor() {
  serverEditor ??= createEditor();
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

const EVIDENCE_LINE = /^>\s*\[evidence:([^\]]+)\]\s*(.*)$/;
const EVIDENCE_TOKEN = "EXPRESSOEVIDENCE";
const CUSTOM_FENCE = /^```expresso-block\n[\s\S]*?\n```$/gm;
const CUSTOM_TOKEN = "EXPRESSOBLOCK";

/**
 * Markdown을 BlockNote 블록으로 읽습니다. 서식 · 링크 · 중첩 목록 · 표 · 그림은 BlockNote 파서가 지킵니다.
 * 근거 참조 블록(`> [evidence:출처] 문장`)과 v1 미디어 주소(`media:` · `file:`)는 이 저장소의 문법이라 앞뒤에서 바꿉니다.
 */
export async function markdownToBlockNoteBlocks(markdown: string): Promise<CareerBlockNoteBlock[]> {
  const sources: string[] = [];
  // 콜아웃처럼 Markdown 문법이 없는 블록은 `expresso-block` 울타리에 v1 블록 JSON으로 적혀 있습니다.
  // BlockNote 파서는 이 울타리를 코드 블록으로 읽으므로, 자리 표시 문단으로 바꿔 두고 v1 변환으로 되살립니다.
  const customs: CareerBlockNoteBlock[][] = [];
  const unfenced = markdown.replaceAll("\r\n", "\n").replace(CUSTOM_FENCE, (fence) => {
    customs.push(careerDocumentToBlockNote(markdownToCareerDocument(fence)).blocks);
    return `${CUSTOM_TOKEN}${customs.length - 1}`;
  });
  const prepared = unfenced.split("\n").map((line) => {
    const evidence = EVIDENCE_LINE.exec(line);
    if (evidence) { sources.push(evidence[1] ?? ""); return `> ${EVIDENCE_TOKEN}${sources.length - 1} ${evidence[2] ?? ""}`; }
    return line
      .replace(/!\[([^\]]*)\]\(media:([0-9a-f-]{36})\)/gi, "![$1](/v1/media/$2)")
      .replace(/\[([^\]]+)\]\(file:([0-9a-f-]{36})\)/gi, "[$1](/v1/media/$2)");
  }).join("\n");
  const parsed = await editor().tryParseMarkdownToBlocks(prepared) as unknown as CareerBlockNoteBlock[];
  return parsed.flatMap((block) => {
    const content = (block as unknown as { type: string; content?: InlineNode[] }).content;
    const token = block.type === "paragraph" && content?.length === 1 ? new RegExp(`^${CUSTOM_TOKEN}(\\d+)$`).exec(content[0]?.text ?? "") : null;
    return token ? customs[Number(token[1])] ?? [] : [restoreEvidence(block, sources)];
  });
}

type InlineNode = { type?: string; text?: string; styles?: unknown; content?: unknown };
function restoreEvidence(block: CareerBlockNoteBlock, sources: readonly string[]): CareerBlockNoteBlock {
  const node = block as unknown as { type: string; content?: unknown; children?: CareerBlockNoteBlock[] };
  const children = node.children?.map((child) => restoreEvidence(child, sources));
  const content = Array.isArray(node.content) ? (node.content as InlineNode[]).map((item) => (
    // 파서는 Markdown의 줄바꿈 뒤 들여쓰기를 공백으로 남깁니다. 줄바꿈만 남깁니다.
    item.type === "text" && typeof item.text === "string" ? { ...item, text: item.text.replace(/\n /g, "\n") } : item
  )) : node.content;
  const first = Array.isArray(content) ? (content as InlineNode[])[0] : undefined;
  const match = node.type === "quote" && first?.type === "text" ? new RegExp(`^${EVIDENCE_TOKEN}(\\d+) ?`).exec(first.text ?? "") : null;
  if (!match) return { ...block, ...(content === undefined ? {} : { content }), ...(children ? { children } : {}) } as CareerBlockNoteBlock;
  const rest = [{ ...first, text: (first?.text ?? "").slice(match[0].length) }, ...(content as InlineNode[]).slice(1)].filter((item) => item.type !== "text" || item.text);
  return { ...block, type: "evidence", props: { source: sources[Number(match[1])] ?? "" }, content: rest, ...(children ? { children } : {}) } as unknown as CareerBlockNoteBlock;
}

/** BlockNote 블록으로 새 Yjs 상태를 만듭니다. 스냅샷이 없는 기록을 처음 열 때 씁니다. */
export function blockNoteStateFromBlocks(blocks: readonly CareerBlockNoteBlock[]): { blocks: CareerBlockNoteBlock[]; state: Uint8Array } {
  const source = blocks.length ? blocks : [{ type: "paragraph" } as unknown as CareerBlockNoteBlock];
  const yDocument = editor().blocksToYDoc(source as never, BLOCKNOTE_FRAGMENT);
  return restoreBlockNote(Y.encodeStateAsUpdate(yDocument));
}

/** bodyMd 계약 상한(20만 자) 안에서 블록 경계로 자릅니다. 넘는 본문은 목록 · 매칭 응답이 계약에서 막히므로 투영에서 자릅니다. */
export const BODY_MARKDOWN_LIMIT = 200_000;
export function clampBodyMarkdown(markdown: string): string {
  if (markdown.length <= BODY_MARKDOWN_LIMIT) return markdown;
  const cut = markdown.lastIndexOf("\n\n", BODY_MARKDOWN_LIMIT);
  return markdown.slice(0, cut > 0 ? cut : BODY_MARKDOWN_LIMIT);
}

export function blockNoteMarkdown(blocks: readonly CareerBlockNoteBlock[]): Promise<string> {
  return editor().blocksToMarkdownLossy(blocks as never);
}

export function blockNoteStateVector(state: Uint8Array): Uint8Array {
  return Y.encodeStateVectorFromUpdate(state);
}

export function openBlockNote(state: Uint8Array, updates: readonly Uint8Array[] = []): Y.Doc {
  const yDocument = new Y.Doc();
  Y.applyUpdate(yDocument, state);
  for (const update of updates) Y.applyUpdate(yDocument, update);
  return yDocument;
}

/** 목표 블록을 임시 Y.Doc에 넣었다 꺼내 기본 속성을 채웁니다. 이렇게 해야 현재 블록과 JSON으로 비교할 수 있습니다. */
function normalizeBlocks(blocks: readonly CareerBlockNoteBlock[]): CareerBlockNoteBlock[] {
  const source = blocks.length ? blocks : [{ type: "paragraph" }];
  return editor().yDocToBlocks(editor().blocksToYDoc(source as never, BLOCKNOTE_FRAGMENT), BLOCKNOTE_FRAGMENT) as unknown as CareerBlockNoteBlock[];
}

/** 순서를 지킬 수 있는 가장 긴 증가 부분열의 위치들입니다. 이 블록들은 Yjs 항목을 그대로 둡니다. */
function longestIncreasing(values: readonly number[]): Set<number> {
  const tails: number[] = [];
  const previous = new Array<number>(values.length).fill(-1);
  values.forEach((value, index) => {
    if (value < 0) return;
    let low = 0; let high = tails.length;
    while (low < high) { const middle = (low + high) >> 1; if (values[tails[middle]!]! < value) low = middle + 1; else high = middle; }
    if (low > 0) previous[index] = tails[low - 1]!;
    tails[low] = index;
  });
  const kept = new Set<number>();
  for (let index = tails.at(-1) ?? -1; index >= 0; index = previous[index]!) kept.add(index);
  return kept;
}

export interface BlockNoteSyncResult {
  /** 이전 상태 이후의 증분 업데이트입니다. 클라이언트에 그대로 보냅니다. */
  update: Uint8Array;
  state: Uint8Array;
  blocks: CareerBlockNoteBlock[];
  changed: boolean;
}

/**
 * 문서를 목표 블록 배열로 맞추는 Yjs 업데이트를 만듭니다. AI 적용 · 되돌리기 · 이력 복원 · 외부 bodyMd 반영이 씁니다.
 * 바뀌지 않은 최상위 블록은 Yjs 항목을 그대로 두어, 같은 시각 그 블록을 고친 다른 클라이언트 업데이트와 합쳐집니다.
 */
export function syncBlockNoteDocument(state: Uint8Array, updates: readonly Uint8Array[], target: readonly CareerBlockNoteBlock[]): BlockNoteSyncResult {
  const yDocument = openBlockNote(state, updates);
  const before = Y.encodeStateVector(yDocument);
  const current = editor().yDocToBlocks(yDocument, BLOCKNOTE_FRAGMENT) as unknown as CareerBlockNoteBlock[];
  const desired = normalizeBlocks(target);
  const currentIndex = new Map(current.map((block, index) => [block.id, { index, key: JSON.stringify(block) }]));
  const candidates = desired.map((block) => {
    const found = currentIndex.get(block.id);
    return found && found.key === JSON.stringify(block) ? found.index : -1;
  });
  const keptTargets = longestIncreasing(candidates);
  const keptIds = new Set(desired.filter((_, index) => keptTargets.has(index)).map((block) => block.id));
  const changed = keptIds.size !== desired.length || current.length !== desired.length;
  if (changed) {
    yDocument.transact(() => {
      const group = yDocument.getXmlFragment(BLOCKNOTE_FRAGMENT).get(0) as Y.XmlElement;
      for (let index = group.length - 1; index >= 0; index -= 1) {
        const container = group.get(index) as Y.XmlElement;
        if (!keptIds.has(container.getAttribute("id"))) group.delete(index, 1);
      }
      let position = 0;
      for (const block of desired) {
        if (keptIds.has(block.id)) {
          position = group.toArray().findIndex((container) => (container as Y.XmlElement).getAttribute("id") === block.id) + 1;
          continue;
        }
        const temporary = editor().blocksToYDoc([block] as never, BLOCKNOTE_FRAGMENT);
        const container = (temporary.getXmlFragment(BLOCKNOTE_FRAGMENT).get(0) as Y.XmlElement).get(0) as Y.XmlElement;
        group.insert(position, [container.clone()]);
        position += 1;
      }
    });
  }
  return {
    update: Y.encodeStateAsUpdate(yDocument, before),
    state: Y.encodeStateAsUpdate(yDocument),
    blocks: editor().yDocToBlocks(yDocument, BLOCKNOTE_FRAGMENT) as unknown as CareerBlockNoteBlock[],
    changed,
  };
}
