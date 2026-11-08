import { createHash } from "node:crypto";

export const fingerprint = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function terms(text: string): string[] {
  return [...new Set(text.normalize("NFKC").toLowerCase().match(/[\p{L}\p{N}+#.]+/gu) ?? [])].slice(0, 80);
}
/** 단어와 한글 부분 문자열을 함께 비교합니다. 의미 검색 점수와는 구분합니다. */
export function lexical(query: string, text: string): number {
  const hay = text.normalize("NFKC").toLowerCase();
  const tokens = terms(query);
  if (!tokens.length) return 0;
  return tokens.reduce((sum, token) => sum + (hay.includes(token) ? 1 : 0), 0) / tokens.length;
}
export function cosine(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length || ![...a, ...b].every(Number.isFinite)) throw new Error("검색 벡터 차원이 다릅니다.");
  const dot = a.reduce((v, x, i) => v + x * b[i]!, 0);
  const norm = Math.hypot(...a) * Math.hypot(...b);
  return norm ? dot / norm : 0;
}
/** 점수 크기가 다른 검색기는 순위로 결합합니다. */
export function fuse<T>(rows: T[], keyword: (row: T) => number, semantic?: (row: T) => number): { row: T; score: number }[] {
  const scores = new Map<T, number>();
  for (const fn of semantic ? [keyword, semantic] : [keyword]) {
    const ranked = rows.map((row, i) => ({ row, i, score: fn(row) })).filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score || a.i - b.i);
    ranked.forEach(({ row }, i) => scores.set(row, (scores.get(row) ?? 0) + 1 / (60 + i + 1)));
  }
  return rows.filter(row => scores.has(row)).map(row => ({ row, score: scores.get(row)! })).sort((a, b) => b.score - a.score);
}
