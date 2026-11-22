import type { EvidenceQuote, ModelProfile } from "@expresso/contracts";

/** 추론 결과의 인용은 본인 입력의 Unicode 코드 포인트 위치와 원문이 같을 때만 표시한다. */
export function verifiedQuote(record: ModelProfile["records"][number], quote: EvidenceQuote): EvidenceQuote | undefined {
  let source: string;
  if (quote.source === "property") {
    if (!quote.propertyKey || !Object.hasOwn(record.properties ?? {}, quote.propertyKey)) return;
    const value = record.properties![quote.propertyKey];
    source = typeof value === "string" ? value : JSON.stringify(canonical(value));
  } else source = record[quote.source];
  const characters = Array.from(source);
  if (quote.end > characters.length || characters.slice(quote.start, quote.end).join("") !== quote.text) return;
  return quote;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => [key, canonical(item)]));
  return value;
}
