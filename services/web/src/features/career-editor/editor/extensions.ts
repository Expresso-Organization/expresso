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
} from "@expresso/editor";

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
        nextState.doc.descendants((node, position) => {
          if (node.type.name !== "doc" && Object.hasOwn(node.attrs, "careerId") && !node.attrs.careerId) {
            transaction.setNodeMarkup(position, undefined, { ...node.attrs, careerId: crypto.randomUUID() });
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

function textContent(spans: readonly CareerTextSpan[] | undefined): JSONContent[] {
  return (spans ?? []).map((span) => ({
    type: "text",
    text: span.text,
    ...(span.marks?.length ? {
      marks: span.marks.map((mark) => ({
        type: mark.type,
        ...(mark.attrs ? { attrs: mark.attrs } : {}),
      })),
    } : {}),
  }));
}

function blockToTiptap(block: CareerBlock): JSONContent {
  const attrs = { careerId: block.id };
  const children = block.content?.map(blockToTiptap);
  if (block.type === "paragraph") return { type: "paragraph", attrs, content: textContent(block.text) };
  if (/^heading[1-3]$/.test(block.type)) return { type: "heading", attrs: { ...attrs, level: Number(block.type.at(-1)) }, content: textContent(block.text) };
  if (block.type === "bulletList" || block.type === "orderedList") return { type: block.type, attrs, ...(children ? { content: children } : {}) };
  if (block.type === "taskList") {
    const items = children?.map((item) => ({ ...item, type: "taskItem", attrs: { ...item.attrs, checked: Boolean(item.attrs?.checked) } }));
    return { type: "taskList", attrs, ...(items ? { content: items } : {}) };
  }
  if (block.type === "listItem") return { type: "listItem", attrs, content: children?.length ? children : [{ type: "paragraph", attrs: { careerId: crypto.randomUUID() }, content: textContent(block.text) }] };
  if (block.type === "blockquote") return { type: "blockquote", attrs, content: children?.length ? children : [{ type: "paragraph", attrs: { careerId: crypto.randomUUID() }, content: textContent(block.text) }] };
  if (block.type === "code") return { type: "codeBlock", attrs: { ...attrs, language: block.attrs.language ?? null }, content: textContent(block.text) };
  if (block.type === "horizontalRule") return { type: "horizontalRule", attrs };
  if (block.type === "image") return { type: "image", attrs: { ...attrs, src: `media:${String(block.attrs.mediaId ?? "")}`, alt: String(block.attrs.alt ?? "") } };
  if (block.type === "table" || block.type === "tableRow") return { type: block.type, attrs, ...(children ? { content: children } : {}) };
  if (block.type === "tableCell") return {
    type: "tableCell",
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

function spans(node: JSONContent): CareerTextSpan[] | undefined {
  const values = node.content?.filter((child) => child.type === "text").map((child) => ({
    text: child.text ?? "",
    ...(child.marks?.length ? { marks: child.marks.map((mark) => ({ type: mark.type as "bold" | "italic" | "strike" | "code" | "link", ...(mark.attrs ? { attrs: mark.attrs } : {}) })) } : {}),
  }));
  return values?.length ? values : undefined;
}

function tiptapToBlock(node: JSONContent): CareerBlock {
  if (node.type === "careerCompatibility" && node.attrs?.original) return node.attrs.original as CareerBlock;
  const blockId = id(node.attrs?.careerId);
  const content = node.content?.filter((child) => child.type !== "text").map(tiptapToBlock);
  const base = { id: blockId, attrs: {}, ...(content?.length ? { content } : {}), ...(spans(node) ? { text: spans(node) } : {}) };
  if (node.type === "heading") return { ...base, type: `heading${node.attrs?.level ?? 1}` };
  if (node.type === "codeBlock") return { ...base, type: "code", attrs: { language: node.attrs?.language ?? null } };
  if (node.type === "taskItem") return { ...base, type: "listItem", attrs: { checked: Boolean(node.attrs?.checked) } };
  if (node.type === "image") return { ...base, type: "image", attrs: { mediaId: String(node.attrs?.src ?? "").replace(/^media:/, ""), alt: node.attrs?.alt ?? "" } };
  const mapped = node.type === "taskList" ? "taskList" : node.type === "horizontalRule" ? "horizontalRule" : node.type;
  return { ...base, type: mapped ?? "paragraph" };
}

export function tiptapToCareerDocument(content: JSONContent): CareerDocument {
  return parseCareerDocument({ schemaVersion: 1, type: "doc", content: (content.content ?? []).map(tiptapToBlock) });
}
