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
export const careerBlockNoteSchema = BlockNoteSchema.create({
  blockSpecs: { ...defaultBlockSpecs, callout: createCalloutBlockSpec() } as unknown as BlockSpecs,
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
