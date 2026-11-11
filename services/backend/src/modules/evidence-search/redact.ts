/** 임베딩 공급자에만 적용합니다. 원문 인용·키워드 색인은 변경하지 않습니다. */
export function redactEmbeddingText(text: string): string {
  return text
    .replace(/https?:\/\/[^\s<>]+/gi, "[URL]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[EMAIL]")
    .replace(/\b(?:01[016789][ -]?\d{3,4}[ -]?\d{4}|\d{6}[ -]?[1-4]\d{6})\b/g, "[PRIVATE_NUMBER]")
    .replace(/\b(?:sk-|exvt_|Bearer\s+)[A-Za-z0-9_\-.]{8,}/gi, "[TOKEN]");
}
