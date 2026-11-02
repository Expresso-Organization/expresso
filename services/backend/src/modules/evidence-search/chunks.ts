import type { CareerDocumentBootstrap } from "@expresso/contracts";
import type { EvidenceIndexChunk } from "@expresso/database";
import { careerDocumentToMarkdown } from "@expresso/editor";

/** 문장 중간의 부정·역할 표현을 잘라 내지 않도록 문단을 그대로 유지합니다. */
export function splitText(text: string): string[] {
  const result: string[] = [];
  for (const paragraph of text.split(/\n\s*\n/).filter(x => x.trim())) {
    if (paragraph.length <= 1800) { result.push(paragraph); continue; }
    // 긴 문단은 겹치는 원문 구간으로 나눕니다. 의미 정확성은 보장하지 않습니다.
    for (let i = 0; i < paragraph.length; i += 1400) result.push(paragraph.slice(i, i + 1800));
  }
  return result;
}
export function documentChunks(title: string, document: CareerDocumentBootstrap["document"], properties: Record<string, unknown>): EvidenceIndexChunk[] {
  const rows: EvidenceIndexChunk[] = [{ blockId: null, source: "title", text: title.slice(0, 1800), vector: null }];
  // 각 최상위 블록의 전체 하위 문맥을 함께 읽습니다. 인용 위치는 그 부모 블록입니다.
  for (const block of document.content) {
    const text = careerDocumentToMarkdown({ ...document, content: [block] });
    for (const quote of splitText(text)) rows.push({ blockId: block.id, source: "body", text: quote, vector: null });
  }
  function values(value: unknown): string[] {
    if (typeof value === "string") return value.trim() ? [value] : [];
    if (typeof value === "number") return [String(value)];
    if (Array.isArray(value)) return value.flatMap(values);
    return value && typeof value === "object" ? Object.values(value).flatMap(values) : [];
  }
  for (const text of Object.values(properties).flatMap(values)) {
    for (const quote of splitText(text)) rows.push({ blockId: null, source: "property", text: quote, vector: null });
  }
  return rows.filter(row => row.text.trim());
}
