import { Extension, Node, type JSONContent } from "@tiptap/core";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { Table } from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import StarterKit from "@tiptap/starter-kit";
import { Plugin } from "@tiptap/pm/state";
import {
  CAREER_BLOCK_TYPES,
  parseCareerDocument,
  type CareerBlock,
  type CareerDocument,
  type CareerTextSpan,
} from "@expresso/editor/document";

const knownTypes = new Set<string>(CAREER_BLOCK_TYPES);

function id(value?: unknown): string {
  return typeof value === "string" ? value : crypto.randomUUID();
}

const CareerIds = Extension.create({
  name: "careerIds",
  addGlobalAttributes() {
    return [{
      types: [
        "paragraph", "heading", "bulletList", "orderedList", "listItem", "taskList", "taskItem",
        "blockquote", "codeBlock", "horizontalRule", "image", "table", "tableRow", "tableHeader", "tableCell",
      ],
      attributes: { careerId: { default: null, parseHTML: (element) => element.getAttribute("data-career-id"), renderHTML: (attributes) => attributes.careerId ? { "data-career-id": attributes.careerId } : {} } },
    }];
  },
  addProseMirrorPlugins() {
    return [new Plugin({
      appendTransaction(transactions, _oldState, nextState) {
        if (!transactions.some((transaction) => transaction.docChanged)) return null;
        const transaction = nextState.tr;
        let changed = false;
        const seen = new Set<string>();
        nextState.doc.descendants((node, position) => {
          if (node.type.name !== "doc" && Object.hasOwn(node.attrs, "careerId")) {
            const current = typeof node.attrs.careerId === "string" ? node.attrs.careerId : null;
            if (current && !seen.has(current)) { seen.add(current); return; }
            // split·paste가 attrs를 복제해도 안정 ID는 문서 안에서 한 번만 사용합니다.
            const nextId = crypto.randomUUID(); seen.add(nextId);
            transaction.setNodeMarkup(position, undefined, { ...node.attrs, careerId: nextId });
            changed = true;
          }
        });
        return changed ? transaction : null;
      },
    })];
  },
});

export const CareerCompatibilityBlock = Node.create({
  name: "careerCompatibility",
  group: "block",
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      careerId: { default: null },
      originalType: { default: "unknown" },
      original: { default: {} },
      label: { default: "지원하지 않는 블록" },
    };
  },
  parseHTML() { return [{ tag: "div[data-career-compatibility]" }]; },
  renderHTML({ HTMLAttributes }) {
    return ["div", {
      "data-career-compatibility": "true",
      "data-career-id": HTMLAttributes.careerId,
      contenteditable: "false",
      role: "note",
    }, `${HTMLAttributes.label}: ${HTMLAttributes.originalType}`];
  },
});

export const careerEditorExtensions = [
  StarterKit.configure({ link: false, undoRedo: {} }),
  Link.configure({ openOnClick: false, autolink: true, defaultProtocol: "https" }),
  Image.configure({ inline: false, allowBase64: false }),
  TaskList,
  TaskItem.configure({ nested: true }),
  Table.configure({ resizable: true }),
  TableRow,
  TableHeader,
  TableCell,
  Placeholder.configure({ placeholder: "입력하거나 / 를 눌러 명령어를 사용하세요" }),
  CareerIds,
  CareerCompatibilityBlock,
];

/** 문단 안 줄바꿈은 span 텍스트의 `\n`으로 저장하고, 열 때 hardBreak 노드로 되돌립니다. */
function textContent(spans: readonly CareerTextSpan[] | undefined): JSONContent[] {
  return (spans ?? []).flatMap((span) => {
    const marks = span.marks?.length ? {
      marks: span.marks.map((mark) => ({
        type: mark.type,
        ...(mark.attrs ? { attrs: mark.attrs } : {}),
      })),
    } : {};
    return span.text.split("\n").flatMap((part, index): JSONContent[] => [
      ...(index > 0 ? [{ type: "hardBreak" }] : []),
      ...(part ? [{ type: "text", text: part, ...marks }] : []),
    ]);
  });
}

function blockToTiptap(block: CareerBlock): JSONContent {
  const attrs = { careerId: block.id };
  const children = block.content?.map(blockToTiptap);
  if (block.type === "paragraph") return { type: "paragraph", attrs, content: textContent(block.text) };
  if (/^heading[1-3]$/.test(block.type)) return { type: "heading", attrs: { ...attrs, level: Number(block.type.at(-1)) }, content: textContent(block.text) };
  if (block.type === "bulletList" || block.type === "orderedList") return { type: block.type, attrs, ...(children ? { content: children } : {}) };
  if (block.type === "taskList") {
    // 완료 표시는 v1 listItem 블록의 attrs에 있으므로 원본 블록에서 읽습니다.
    const items = children?.map((item, index) => ({ ...item, type: "taskItem", attrs: { ...item.attrs, checked: Boolean(block.content?.[index]?.attrs["checked"]) } }));
    return { type: "taskList", attrs, ...(items ? { content: items } : {}) };
  }
  if (block.type === "listItem") return { type: "listItem", attrs, content: children?.length ? children : [{ type: "paragraph", attrs: { careerId: crypto.randomUUID() }, content: textContent(block.text) }] };
  if (block.type === "blockquote") return { type: "blockquote", attrs, content: children?.length ? children : [{ type: "paragraph", attrs: { careerId: crypto.randomUUID() }, content: textContent(block.text) }] };
  if (block.type === "code") return { type: "codeBlock", attrs: { ...attrs, language: block.attrs.language ?? null }, content: textContent(block.text) };
  if (block.type === "horizontalRule") return { type: "horizontalRule", attrs };
  if (block.type === "image") return { type: "image", attrs: { ...attrs, src: `media:${String(block.attrs.mediaId ?? "")}`, alt: String(block.attrs.alt ?? "") } };
  if (block.type === "table" || block.type === "tableRow") return { type: block.type, attrs, ...(children ? { content: children } : {}) };
  if (block.type === "tableCell" || block.type === "tableHeader") return {
    type: block.type,
    attrs,
    content: children?.length ? children : [{ type: "paragraph", attrs: { careerId: crypto.randomUUID() }, content: textContent(block.text) }],
  };
  return {
    type: "careerCompatibility",
    attrs: {
      ...attrs,
      originalType: block.type,
      original: block,
      label: knownTypes.has(block.type) ? "읽기 전용 블록" : "새 버전에서 만든 블록",
    },
  };
}

export function careerDocumentToTiptap(document: CareerDocument): JSONContent {
  return { type: "doc", content: parseCareerDocument(document).content.map(blockToTiptap) };
}

const INLINE_NODES = new Set(["text", "hardBreak"]);

function spans(node: JSONContent): CareerTextSpan[] | undefined {
  const values = node.content?.filter((child) => INLINE_NODES.has(child.type ?? "")).map((child) => child.type === "hardBreak" ? { text: "\n" } : ({
    text: child.text ?? "",
    ...(child.marks?.length ? { marks: child.marks.map((mark) => ({ type: mark.type as NonNullable<CareerTextSpan["marks"]>[number]["type"], ...(mark.attrs ? { attrs: mark.attrs } : {}) })) } : {}),
  }));
  return values?.length ? values : undefined;
}

function tiptapToBlock(node: JSONContent, seen: Set<string>): CareerBlock {
  let blockId = id(node.attrs?.careerId);
  if (seen.has(blockId)) blockId = crypto.randomUUID();
  seen.add(blockId);
  if (node.type === "careerCompatibility" && node.attrs?.original) return { ...(node.attrs.original as CareerBlock), id: blockId };
  const content = node.content?.filter((child) => !INLINE_NODES.has(child.type ?? "")).map((child) => tiptapToBlock(child, seen));
  const base = { id: blockId, attrs: {}, ...(content?.length ? { content } : {}), ...(spans(node) ? { text: spans(node) } : {}) };
  if (node.type === "heading") return { ...base, type: `heading${node.attrs?.level ?? 1}` };
  if (node.type === "codeBlock") return { ...base, type: "code", attrs: { language: node.attrs?.language ?? null } };
  if (node.type === "taskItem") return { ...base, type: "listItem", attrs: { checked: Boolean(node.attrs?.checked) } };
  if (node.type === "image") return { ...base, type: "image", attrs: { mediaId: String(node.attrs?.src ?? "").replace(/^media:/, ""), alt: node.attrs?.alt ?? "" } };
  const mapped = node.type === "taskList" ? "taskList" : node.type === "horizontalRule" ? "horizontalRule" : node.type;
  return { ...base, type: mapped ?? "paragraph" };
}

export function tiptapToCareerDocument(content: JSONContent): CareerDocument {
  const seen = new Set<string>();
  return parseCareerDocument({ schemaVersion: 1, type: "doc", content: (content.content ?? []).map((node) => tiptapToBlock(node, seen)) });
}
