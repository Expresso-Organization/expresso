import {
  JobAnalysisExtractionSchema,
  type JobAnalysisExtraction,
} from "@expresso/contracts";

export interface RequirementExtractor {
  extract(source: string): Promise<JobAnalysisExtraction>;
}

const TECHNOLOGIES = [
  "typescript",
  "javascript",
  "python",
  "java",
  "postgresql",
  "kubernetes",
  "aws",
] as const;

function findCodePointSpan(source: string, quote: string, fromIndex: number) {
  const index = source.indexOf(quote, fromIndex);
  if (index < 0) throw new Error("extractor quote disappeared from source");
  const start = Array.from(source.slice(0, index)).length;
  return { start, end: start + Array.from(quote).length, quote, nextIndex: index + quote.length };
}

export class RuleBasedRequirementExtractor implements RequirementExtractor {
  async extract(source: string): Promise<JobAnalysisExtraction> {
    const candidates = source
      .split(/(?<=[.!?。])\s+|\n+/)
      .map((value) => value.trim())
      .filter((value) => value.length >= 20)
      .slice(0, 6);
    if (candidates.length < 3) {
      const points = Array.from(source);
      const chunkSize = Math.max(Math.floor(points.length / 3), 1);
      candidates.length = 0;
      for (let index = 0; index < 3; index += 1) {
        const quote = points.slice(index * chunkSize, index === 2 ? undefined : (index + 1) * chunkSize)
          .join("").trim();
        if (quote) candidates.push(quote);
      }
    }
    if (candidates.length < 3) throw new Error("posting source has too little structure");

    let cursor = 0;
    const requirements = candidates.map((quote, index) => {
      const span = findCodePointSpan(source, quote, cursor);
      cursor = span.nextIndex;
      return {
        label: quote.slice(0, 120),
        kind: index < 2 ? "must" as const : "nice" as const,
        // 규칙으로는 축을 못 가린다. 억지로 붙이지 않는다 — 축 게이지에서만
        // 빠지고 총점(요건 충족률)에는 그대로 들어간다.
        axis: "other" as const,
        sourceSpan: { start: span.start, end: span.end, quote },
      };
    });
    const normalizedSource = source.toLocaleLowerCase("en-US");
    return JobAnalysisExtractionSchema.parse({
      requirements,
      normalized: {
        technologies: TECHNOLOGIES.filter((technology) =>
          normalizedSource.includes(technology)),
        impacts: ["scale", "growth", "conversion", "reliability"].filter((value) =>
          normalizedSource.includes(value)),
        roles: ["backend", "frontend", "leadership", "engineer"].filter((value) =>
          normalizedSource.includes(value)),
        conditions: ["remote", "hybrid", "on-site"].filter((value) =>
          normalizedSource.includes(value)),
      },
    });
  }
}
