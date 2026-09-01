import { randomUUID } from "node:crypto";
import { parseCareerDocument, type CareerBlock, type CareerDocument } from "./document.js";

function textBlock(type: string, value: string, attrs: Record<string, unknown> = {}): CareerBlock {
  return { id: randomUUID(), type, attrs, text: value ? [{ text: value }] : [] };
}
function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
function blockText(block: CareerBlock): string {
  return block.text?.map((span) => span.text).join("") ?? block.content?.map(blockText).join("\n") ?? "";
}
function sourceMarkdown(block: CareerBlock): string | undefined {
  const source = block.attrs["sourceMarkdown"];
  return typeof source === "string" ? source : undefined;
}

export function markdownToCareerDocument(markdown: string): CareerDocument {
  const lines = markdown.replaceAll("\r\n", "\n").split("\n");
  const content: CareerBlock[] = [];
  for (let index = 0; index < lines.length;) {
    const line = lines[index] ?? "";
    if (line.trim() === "") { index += 1; continue; }
    const fence = /^```([^\s]*)\s*$/.exec(line);
    if (fence) {
      const start = index;
      const body: string[] = [];
      index += 1;
      while (index < lines.length && lines[index] !== "```") body.push(lines[index++] ?? "");
      if (index < lines.length) index += 1;
      const raw = lines.slice(start, index).join("\n");
      if (fence[1] === "expresso-block") {
        try {
          const parsed = JSON.parse(body.join("\n")) as CareerBlock;
          content.push({ ...parsed, id: parsed.id ?? randomUUID() });
        } catch { content.push(textBlock("paragraph", escapeHtml(raw))); }
      } else {
        content.push(textBlock("code", body.join("\n"), { language: fence[1] || null, sourceMarkdown: raw }));
      }
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) { content.push(textBlock(`heading${heading[1]?.length}`, heading[2] ?? "")); index += 1; continue; }
    if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) { content.push({ id: randomUUID(), type: "horizontalRule", attrs: {} }); index += 1; continue; }
    const media = /^!\[([^\]]*)\]\(media:([^)]+)\)$/.exec(line);
    if (media) { content.push({ id: randomUUID(), type: "image", attrs: { alt: media[1] ?? "", mediaId: media[2] ?? "", sourceMarkdown: line } }); index += 1; continue; }
    const file = /^\[([^\]]+)\]\(file:([^)]+)\)$/.exec(line);
    if (file) { content.push({ id: randomUUID(), type: "file", attrs: { name: file[1] ?? "", mediaId: file[2] ?? "", sourceMarkdown: line } }); index += 1; continue; }
    const evidence = /^>\s*\[evidence:([^\]]+)\]\s*(.*)$/.exec(line);
    if (evidence) { content.push(textBlock("evidence", evidence[2] ?? "", { source: evidence[1] ?? "", sourceMarkdown: line })); index += 1; continue; }
    if (/^\|.*\|\s*$/.test(line)) {
      const start = index;
      while (index < lines.length && /^\|.*\|\s*$/.test(lines[index] ?? "")) index += 1;
      const raw = lines.slice(start, index).join("\n");
      const rows = lines.slice(start, index).filter((row, rowIndex) => rowIndex !== 1 || !/^\|(?:\s*:?-+:?\s*\|)+$/.test(row));
      content.push({ id: randomUUID(), type: "table", attrs: { sourceMarkdown: raw }, content: rows.map((row) => ({ id: randomUUID(), type: "tableRow", attrs: {}, content: row.slice(1, -1).split("|").map((cell) => textBlock("tableCell", cell.trim())) })) });
      continue;
    }
    const listPattern = /^\s*(?:[-*+] |\d+[.)] |[-*+] \[[ xX]\] )/;
    if (listPattern.test(line)) {
      const start = index;
      while (index < lines.length && listPattern.test(lines[index] ?? "")) index += 1;
      const raw = lines.slice(start, index).join("\n");
      const type = /\[[ xX]\]/.test(line) ? "taskList" : /^\s*\d/.test(line) ? "orderedList" : "bulletList";
      content.push({ id: randomUUID(), type, attrs: { sourceMarkdown: raw }, content: lines.slice(start, index).map((item) => textBlock("listItem", item.replace(listPattern, ""))) });
      continue;
    }
    if (/^>\s?/.test(line)) {
      const start = index;
      while (index < lines.length && /^>\s?/.test(lines[index] ?? "")) index += 1;
      const raw = lines.slice(start, index).join("\n");
      content.push(textBlock("blockquote", raw.replace(/^>\s?/gm, ""), { sourceMarkdown: raw }));
      continue;
    }
    const paragraph: string[] = [];
    while (index < lines.length && (lines[index] ?? "").trim() !== "") paragraph.push(lines[index++] ?? "");
    content.push(textBlock("paragraph", escapeHtml(paragraph.join("\n"))));
  }
  if (content.length === 0) content.push(textBlock("paragraph", ""));
  return parseCareerDocument({ schemaVersion: 1, type: "doc", content });
}

function serializeBlock(block: CareerBlock): string {
  const source = sourceMarkdown(block);
  if (source) return source;
  if (/^heading[1-3]$/.test(block.type)) return `${"#".repeat(Number(block.type.at(-1)))} ${blockText(block)}`;
  if (block.type === "horizontalRule") return "---";
  if (["paragraph", "blockquote", "callout"].includes(block.type)) return blockText(block);
  return `\`\`\`expresso-block\n${JSON.stringify(block)}\n\`\`\``;
}

export function careerDocumentToMarkdown(document: CareerDocument): string {
  return parseCareerDocument(document).content.map(serializeBlock).join("\n\n");
}
