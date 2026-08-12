import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import type { ExtractedRequirement } from "@expresso/contracts";

import { calculateRequirementCoverage } from "./coverage.js";
import {
  AnalysisEvidenceError,
  codePointSlice,
  validateExtractionSource,
} from "./source-span.js";

describe("job analysis evidence", () => {
  it("uses Unicode code-point offsets and rejects a changed quote", async () => {
    const source = [
      "한국어와 TypeScript로 안정적인 API를 개발합니다.",
      "PostgreSQL 운영 경험과 장애 대응 역량이 필요합니다.",
      "AWS 환경에서 서비스 신뢰성을 개선합니다.",
    ].join(" ");
    // 스팬은 **코드 포인트**로 센다. 한국어가 섞이면 UTF-16 인덱스와 갈라지므로
    // 여기서 인용문의 위치를 직접 세어 계약대로 만든다.
    const extraction = {
      requirements: source
        .split(/(?<=\.)\s+/)
        .map((quote) => {
          const start = Array.from(source.slice(0, source.indexOf(quote))).length;
          return {
            label: quote,
            kind: "must" as const,
            axis: "other" as const,
            sourceSpan: { start, end: start + Array.from(quote).length, quote },
          };
        }),
      normalized: { technologies: [], impacts: [], roles: [], conditions: [] },
    };

    expect(extraction.requirements).toHaveLength(3);
    for (const requirement of extraction.requirements) {
      const { start, end, quote } = requirement.sourceSpan;
      expect(codePointSlice(source, start, end)).toBe(quote);
    }

    const tampered = structuredClone(extraction);
    tampered.requirements[0]!.sourceSpan.quote += " 변조";
    expect(() => validateExtractionSource(source, tampered)).toThrow(
      AnalysisEvidenceError,
    );
  });

  it("classifies covered, partial, and missing evidence with record IDs", () => {
    const requirement: ExtractedRequirement = {
      label: "TypeScript PostgreSQL API reliability",
      kind: "must",
      axis: "other" as const,
      sourceSpan: {
        start: 0,
        end: 37,
        quote: "TypeScript PostgreSQL API reliability",
      },
    };
    const coveredId = randomUUID();
    const partialId = randomUUID();

    expect(calculateRequirementCoverage(requirement, [
      { id: coveredId, text: "Improved TypeScript PostgreSQL API reliability." },
      { id: partialId, text: "Built a TypeScript UI." },
    ])).toEqual({ coverage: "covered", coveredBy: [coveredId] });
    expect(calculateRequirementCoverage(requirement, [
      { id: partialId, text: "Built a TypeScript UI." },
    ])).toEqual({ coverage: "partial", coveredBy: [partialId] });
    expect(calculateRequirementCoverage(requirement, [
      { id: randomUUID(), text: "Designed a brand identity." },
    ])).toEqual({ coverage: "missing", coveredBy: [] });
  });
});
