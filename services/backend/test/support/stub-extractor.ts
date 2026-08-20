import {
  JobAnalysisExtractionSchema,
  type JobAnalysisExtraction,
} from "@expresso/contracts";

import type { RequirementExtractor } from "../../src/modules/job-analysis/extractor.js";

/**
 * 테스트가 쓰는 추출기.
 *
 * **프로덕션 폴백이 아니다.** 규칙으로 문장을 자르면 회사 비전 문구와 마크다운
 * 헤딩이 "필수 요건"으로 올라오므로 그 경로는 제품에서 걷어냈다. 여기 있는 것은
 * AI 계약을 부르지 않고도 파이프라인(스팬 검증 · 커버리지 · 큐 · 재분석)을 끝까지
 * 돌리기 위한 **결정적 대역**이고, 이 파일은 `test/` 밖에서 import되지 않는다.
 *
 * 그래서 뽑는 문장의 품질은 여기서 따지지 않는다 — 검증 대상은 파이프라인이다.
 */
export class StubRequirementExtractor implements RequirementExtractor {
  readonly #limit: number;

  constructor(limit = 6) {
    this.#limit = limit;
  }

  async extract(source: string): Promise<JobAnalysisExtraction> {
    const sentences = source
      .split(/(?<=[.!?。])\s+|\n+/)
      .map((value) => value.trim())
      .filter((value) => value.length >= 20)
      .slice(0, this.#limit);
    if (sentences.length < 3) {
      throw new Error("stub extractor needs a source with at least three sentences");
    }

    let cursor = 0;
    const requirements = sentences.map((quote, index) => {
      const index0 = source.indexOf(quote, cursor);
      if (index0 < 0) throw new Error("stub extractor quote disappeared from source");
      cursor = index0 + quote.length;
      const start = Array.from(source.slice(0, index0)).length;
      return {
        label: quote.slice(0, 120),
        kind: index < 2 ? ("must" as const) : ("nice" as const),
        axis: "other" as const,
        sourceSpan: { start, end: start + Array.from(quote).length, quote },
      };
    });

    // 일치도는 `normalized`에서 나온다 — 비워 두면 점수 경로가 409로 막혀
    // 파이프라인의 뒷단이 검증되지 않는다. 픽스처 문장에 맞춘 키워드 스캔이다.
    const lower = source.toLocaleLowerCase("en-US");
    const found = (values: readonly string[]) => values.filter((value) => lower.includes(value));

    return JobAnalysisExtractionSchema.parse({
      requirements,
      normalized: {
        technologies: found([
          "typescript", "javascript", "python", "java", "postgresql", "kubernetes", "aws",
        ]),
        impacts: found(["scale", "growth", "conversion", "reliability"]),
        roles: found(["backend", "frontend", "leadership", "engineer"]),
        conditions: found(["remote", "hybrid", "on-site"]),
      },
    });
  }
}
