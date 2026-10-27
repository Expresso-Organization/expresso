import {
  BlockNoteSchema,
  type BlockSpecs,
  createBlockConfig,
  createBlockSpec,
  defaultBlockSpecs,
} from "@blocknote/core";

import type { CareerBlock, CareerDocument, CareerTextSpan } from "./document.js";

/** BlockNote 본문을 쓰는 문서의 schemaVersion입니다. v1은 CareerDocument JSON입니다. */
export const BLOCKNOTE_SCHEMA_VERSION = 2;
/** BlockNote가 Y.Doc 안에서 쓰는 XmlFragment 이름입니다. 웹과 서버가 같은 값을 써야 합니다. */
export const BLOCKNOTE_FRAGMENT = "document-store";

const createCalloutBlockConfig = createBlockConfig(() => ({
  type: "callout" as const,
  propSchema: { icon: { default: "💡" } },
  content: "inline" as const,
}) as const);

// 백엔드는 DOM 타입 없이 이 파일을 컴파일하므로 쓰는 DOM 기능만 좁혀 적습니다.
interface MinimalElement { setAttribute(name: string, value: string): void; append(...nodes: MinimalElement[]): void; contentEditable: string; textContent: string | null }
const dom = () => (globalThis as unknown as { document: { createElement(tag: string): MinimalElement } }).document;

// 서버(jsdom)와 브라우저가 같은 DOM 구조를 쓰도록 React 없이 정의합니다.
const createCalloutBlockSpec = createBlockSpec(createCalloutBlockConfig, {
  meta: { isolating: false },
  parse(element) {
    return (element as unknown as { getAttribute(name: string): string | null }).getAttribute("data-callout") === "true" ? {} : undefined;
  },
  render(block) {
    const root = dom().createElement("div");
    root.setAttribute("data-callout", "true");
    const icon = dom().createElement("span");
    icon.setAttribute("data-callout-icon", "true");
    icon.contentEditable = "false";
    icon.textContent = block.props.icon;
    const contentDOM = dom().createElement("div");
    contentDOM.setAttribute("data-callout-content", "true");
    root.append(icon, contentDOM);
    return { dom: root, contentDOM } as never;
  },
  // 내보내기(HTML · Markdown)에서는 인용으로 씁니다. 없으면 다음 블록 글과 한 문단으로 붙습니다.
  toExternalHTML() {
    const quote = dom().createElement("blockquote");
    return { dom: quote, contentDOM: quote } as never;
  },
});

// BlockNote 스키마 제네릭은 exactOptionalPropertyTypes를 통과하지 못해 기본 블록 타입으로 좁혀 넘깁니다.
const createEvidenceBlockConfig = createBlockConfig(() => ({
  type: "evidence" as const,
  propSchema: { source: { default: "" } },
  content: "inline" as const,
}) as const);

// 공고 · 다른 기록에서 인용한 문장입니다. 출처는 편집하지 않는 표시로 두고 본문만 고칩니다.
const createEvidenceBlockSpec = createBlockSpec(createEvidenceBlockConfig, {
  meta: { isolating: false },
  parse(element) {
    const source = (element as unknown as { getAttribute(name: string): string | null }).getAttribute("data-evidence");
    return source === null ? undefined : { source };
  },
  render(block) {
    const root = dom().createElement("div");
    root.setAttribute("data-evidence", block.props.source);
    const label = dom().createElement("span");
    label.setAttribute("data-evidence-source", "true");
    label.contentEditable = "false";
    label.textContent = block.props.source;
    const contentDOM = dom().createElement("div");
    contentDOM.setAttribute("data-evidence-content", "true");
    root.append(label, contentDOM);
    return { dom: root, contentDOM } as never;
  },
  // Markdown에서는 v1 문법 `> [evidence:출처] 문장`으로 내보냅니다. markdownToCareerDocument가 같은 문법을 근거 블록으로 읽습니다.
  toExternalHTML(block) {
    const quote = dom().createElement("blockquote");
    const prefix = (globalThis as unknown as { document: { createTextNode(text: string): MinimalElement } }).document.createTextNode(`[evidence:${block.props.source}] `);
    const contentDOM = dom().createElement("span");
    quote.append(prefix, contentDOM);
    return { dom: quote, contentDOM } as never;
  },
});

export const careerBlockNoteSchema = BlockNoteSchema.create({
  blockSpecs: { ...defaultBlockSpecs, callout: createCalloutBlockSpec(), evidence: createEvidenceBlockSpec() } as unknown as BlockSpecs,
});
// BlockNote의 PartialBlock 제네릭은 exactOptionalPropertyTypes에서 제약을 만족하지 못해 JSON 모양을 직접 적습니다.
export interface CareerBlockNoteBlock {
  id?: string;
  type: string;
  props?: Record<string, string | number | boolean>;
  content?: unknown;
  children?: CareerBlockNoteBlock[];
}

type StyledText = { type: "text"; text: string; styles: Record<string, boolean> };
type InlineContent = StyledText | { type: "link"; href: string; content: StyledText[] };

export interface BlockNoteConversion {
  blocks: CareerBlockNoteBlock[];
  /** 대응 블록이 없어 문단으로 남긴 v1 블록 종류별 개수입니다. */
  degraded: Record<string, number>;
}

function spansToInline(spans: readonly CareerTextSpan[] | undefined): InlineContent[] {
  const result: InlineContent[] = [];
  for (const span of spans ?? []) {
    if (!span.text) continue;
    const styles: Record<string, boolean> = {};
    let href: string | undefined;
    for (const mark of span.marks ?? []) {
      if (mark.type === "link") href = typeof mark.attrs?.["href"] === "string" ? mark.attrs["href"] : undefined;
      else styles[mark.type] = true;
    }
    const text: StyledText = { type: "text", text: span.text, styles };
    result.push(href ? { type: "link", href, content: [text] } : text);
  }
  return result;
}

/** 자식 문단에 흩어진 글을 줄바꿈으로 이어 한 블록의 인라인으로 만듭니다. */
function inlineOf(block: CareerBlock): InlineContent[] {
  if (block.text?.length) return spansToInline(block.text);
  const paragraphs = (block.content ?? []).filter((child) => child.text !== undefined || child.type === "paragraph");
  const lines = paragraphs.map((child) => spansToInline(child.text));
  return lines.flatMap((line, index) => index === 0 ? line : [{ type: "text", text: "\n", styles: {} } as StyledText, ...line]);
}

function plain(block: CareerBlock): string {
  return [block.text?.map((span) => span.text).join("") ?? "", ...(block.content ?? []).map(plain)].filter(Boolean).join("\n");
}

function mediaUrl(mediaId: unknown): string {
  return typeof mediaId === "string" && mediaId ? `/v1/media/${mediaId}` : "";
}

export function careerDocumentToBlockNote(document: CareerDocument): BlockNoteConversion {
  const degraded: Record<string, number> = {};
  const degrade = (block: CareerBlock): CareerBlockNoteBlock => {
    degraded[block.type] = (degraded[block.type] ?? 0) + 1;
    return { id: block.id, type: "paragraph", content: plain(block) };
  };
  const listItems = (list: CareerBlock, type: "bulletListItem" | "numberedListItem" | "checkListItem"): CareerBlockNoteBlock[] =>
    (list.content ?? []).map((item) => {
      const nested = (item.content ?? []).filter((child) => /List$/.test(child.type)).flatMap(convert);
      return {
        id: item.id,
        type,
        ...(type === "checkListItem" ? { props: { checked: Boolean(item.attrs["checked"]) } } : {}),
        content: inlineOf({ ...item, content: (item.content ?? []).filter((child) => !/List$/.test(child.type)) }),
        children: nested,
      } as CareerBlockNoteBlock;
    });
  const convert = (block: CareerBlock): CareerBlockNoteBlock[] => {
    switch (block.type) {
      case "paragraph": return [{ id: block.id, type: "paragraph", content: inlineOf(block) } as CareerBlockNoteBlock];
      case "heading1": case "heading2": case "heading3":
        return [{ id: block.id, type: "heading", props: { level: Number(block.type.at(-1)) as 1 | 2 | 3 }, content: inlineOf(block) } as CareerBlockNoteBlock];
      case "bulletList": return listItems(block, "bulletListItem");
      case "orderedList": return listItems(block, "numberedListItem");
      case "taskList": return listItems(block, "checkListItem");
      case "blockquote": return [{ id: block.id, type: "quote", content: inlineOf(block) } as CareerBlockNoteBlock];
      case "code": return [{ id: block.id, type: "codeBlock", props: { language: typeof block.attrs["language"] === "string" ? block.attrs["language"] : "text" }, content: plain(block) } as CareerBlockNoteBlock];
      case "horizontalRule": return [{ id: block.id, type: "divider" } as CareerBlockNoteBlock];
      case "callout": return [{ id: block.id, type: "callout", content: inlineOf(block) } as CareerBlockNoteBlock];
      case "evidence": return [{ id: block.id, type: "evidence", props: { source: String(block.attrs["source"] ?? "") }, content: inlineOf(block) } as CareerBlockNoteBlock];
      case "image": return [{ id: block.id, type: "image", props: { url: mediaUrl(block.attrs["mediaId"]), caption: String(block.attrs["alt"] ?? "") } } as CareerBlockNoteBlock];
      case "file": return [{ id: block.id, type: "file", props: { url: mediaUrl(block.attrs["mediaId"]), name: String(block.attrs["name"] ?? "") } } as CareerBlockNoteBlock];
      case "table": {
        const rows = block.content ?? [];
        const headerRows = rows[0]?.content?.length && rows[0].content.every((cell) => cell.type === "tableHeader") ? 1 : 0;
        return [{
          id: block.id,
          type: "table",
          content: {
            type: "tableContent",
            ...(headerRows ? { headerRows } : {}),
            rows: rows.map((row) => ({ cells: (row.content ?? []).map((cell) => inlineOf(cell)) })),
          },
        } as CareerBlockNoteBlock];
      }
      default: return [degrade(block)];
    }
  };
  return { blocks: document.content.flatMap(convert), degraded };
}

/** 손실 측정용 글자열. 공백을 지워 서식 · 줄 구분 차이는 세지 않습니다. */
export function careerDocumentText(document: CareerDocument): string {
  return document.content.map(plain).join("").replace(/\s+/g, "");
}

export function blockNoteText(blocks: readonly unknown[]): string {
  const parts: string[] = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (!value || typeof value !== "object") return;
    const node = value as Record<string, unknown>;
    if (node["type"] === "text" && typeof node["text"] === "string") { parts.push(node["text"]); return; }
    if (typeof node["content"] === "string") parts.push(node["content"]);
    else visit(node["content"]);
    visit(node["rows"]);
    visit(node["cells"]);
    visit(node["children"]);
  };
  visit(blocks);
  return parts.join("").replace(/\s+/g, "");
}

function fnv1a(value: string, seed: number): number {
  let hash = seed >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

/** 같은 입력에 늘 같은 UUID(버전 8)를 돌려줍니다. BlockNote에 없는 목록 묶음 블록의 ID에 씁니다. */
export function deterministicUuid(value: string): string {
  const hex = [0x811c9dc5, 0x01000193, 0x050c5d1f, 0x3b9aca07].map((seed) => fnv1a(value, seed).toString(16).padStart(8, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-${((Number.parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80).toString(16)}${hex.slice(18, 20)}-${hex.slice(20, 32)}`;
}

const MARK_STYLES = ["bold", "italic", "strike", "code", "underline"] as const;
type MarkStyle = (typeof MARK_STYLES)[number];

function inlineToSpans(content: unknown): CareerTextSpan[] {
  if (typeof content === "string") return content ? [{ text: content }] : [];
  if (!Array.isArray(content)) return [];
  const spans: CareerTextSpan[] = [];
  const pushText = (node: Record<string, unknown>, link?: string) => {
    const text = typeof node["text"] === "string" ? node["text"] : "";
    if (!text) return;
    const styles = (node["styles"] ?? {}) as Record<string, unknown>;
    const marks: NonNullable<CareerTextSpan["marks"]> = MARK_STYLES.filter((style: MarkStyle) => styles[style] === true).map((type) => ({ type }));
    if (link) marks.push({ type: "link", attrs: { href: link } });
    spans.push(marks.length ? { text, marks } : { text });
  };
  for (const item of content as Record<string, unknown>[]) {
    if (item["type"] === "link") {
      const href = typeof item["href"] === "string" ? item["href"] : "";
      for (const child of (item["content"] ?? []) as Record<string, unknown>[]) pushText(child, href);
    } else pushText(item);
  }
  return spans;
}

function mediaId(url: unknown): string {
  return typeof url === "string" ? (/^\/v1\/media\/([0-9a-f-]{36})$/i.exec(url)?.[1] ?? "") : "";
}

type BlockNoteNode = { id?: string; type: string; props?: Record<string, unknown>; content?: unknown; children?: BlockNoteNode[] };
const LIST_TYPES: Record<string, string> = { bulletListItem: "bulletList", numberedListItem: "orderedList", checkListItem: "taskList", toggleListItem: "bulletList" };

/**
 * BlockNote 블록을 v1 문서 모양으로 바꿉니다. AI 제안 · 비교 화면 · 에이전트 채팅이 이 모양을 읽습니다.
 * 블록 ID는 그대로 두고, 연속한 목록 항목은 첫 항목 ID에서 만든 결정적 ID의 목록 블록으로 묶습니다.
 */
export function blockNoteToCareerDocument(blocks: readonly unknown[]): CareerDocument {
  const convertAll = (nodes: readonly BlockNoteNode[]): CareerBlock[] => {
    const result: CareerBlock[] = [];
    for (let index = 0; index < nodes.length;) {
      const node = nodes[index]!;
      const listType = LIST_TYPES[node.type];
      if (listType) {
        const items: BlockNoteNode[] = [];
        while (index < nodes.length && LIST_TYPES[nodes[index]!.type] === listType && nodes[index]!.type === node.type) items.push(nodes[index++]!);
        result.push({
          id: deterministicUuid(`${items[0]!.id ?? ""}:list`),
          type: listType,
          attrs: {},
          content: items.map((item) => {
            const nested = convertAll(item.children ?? []);
            return {
              id: item.id ?? globalThis.crypto.randomUUID(),
              type: "listItem",
              attrs: node.type === "checkListItem" ? { checked: item.props?.["checked"] === true } : {},
              text: inlineToSpans(item.content),
              ...(nested.length ? { content: nested } : {}),
            };
          }),
        });
        continue;
      }
      result.push(...convertOne(node));
      index += 1;
    }
    return result;
  };
  const convertOne = (node: BlockNoteNode): CareerBlock[] => {
    const id = node.id ?? globalThis.crypto.randomUUID();
    const children = convertAll(node.children ?? []);
    const withChildren = (block: CareerBlock): CareerBlock[] => children.length ? [{ ...block, content: [...(block.content ?? []), ...children] }] : [block];
    switch (node.type) {
      case "paragraph": return withChildren({ id, type: "paragraph", attrs: {}, text: inlineToSpans(node.content) });
      case "heading": return withChildren({ id, type: `heading${Math.min(3, Math.max(1, Number(node.props?.["level"] ?? 1)))}`, attrs: {}, text: inlineToSpans(node.content) });
      case "quote": return withChildren({ id, type: "blockquote", attrs: {}, text: inlineToSpans(node.content) });
      case "codeBlock": return withChildren({ id, type: "code", attrs: { language: typeof node.props?.["language"] === "string" ? node.props["language"] : null }, text: inlineToSpans(node.content).map(({ text }) => ({ text })) });
      case "divider": return withChildren({ id, type: "horizontalRule", attrs: {} });
      case "callout": return withChildren({ id, type: "callout", attrs: {}, text: inlineToSpans(node.content) });
      case "evidence": return withChildren({ id, type: "evidence", attrs: { source: String(node.props?.["source"] ?? "") }, text: inlineToSpans(node.content) });
      case "image": return withChildren({ id, type: "image", attrs: { mediaId: mediaId(node.props?.["url"]), alt: String(node.props?.["caption"] ?? "") } });
      case "file": case "video": case "audio":
        return withChildren({ id, type: "file", attrs: { mediaId: mediaId(node.props?.["url"]), name: String(node.props?.["name"] ?? "") } });
      case "table": {
        const table = (node.content ?? {}) as { headerRows?: number; rows?: Array<{ cells?: unknown[] }> };
        const headerRows = table.headerRows ?? 0;
        return withChildren({
          id,
          type: "table",
          attrs: {},
          content: (table.rows ?? []).map((row, rowIndex) => ({
            id: deterministicUuid(`${id}:row:${rowIndex}`),
            type: "tableRow",
            attrs: {},
            content: (row.cells ?? []).map((cell, cellIndex) => ({
              id: deterministicUuid(`${id}:cell:${rowIndex}:${cellIndex}`),
              type: rowIndex < headerRows ? "tableHeader" : "tableCell",
              attrs: {},
              text: inlineToSpans(cell && typeof cell === "object" && !Array.isArray(cell) ? (cell as { content?: unknown }).content : cell),
            })),
          })),
        });
      }
      default: return withChildren({ id, type: "paragraph", attrs: {}, text: inlineToSpans(node.content) });
    }
  };
  const content = convertAll(blocks as BlockNoteNode[]);
  return { schemaVersion: 1, type: "doc", content: content.length ? content : [{ id: globalThis.crypto.randomUUID(), type: "paragraph", attrs: {}, text: [] }] };
}
