import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import type { ExtractedRequirement } from "@expresso/contracts";
import type { z } from "zod";

import type { AiCallOptions, AiCallSpec, AiClient, AiResult } from "../../platform/ai/client.js";
import { AiRequirementExtractor } from "./ai-extractor.js";
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

/** 받은 응답을 계약으로만 거른다. `check`는 어댑터가 부르므로 넘어온 것을 담아 두고 테스트가 직접 부른다. */
class StubAiClient implements AiClient {
  calls: { spec: AiCallSpec; options: AiCallOptions<unknown> | undefined }[] = [];
  constructor(private readonly reply: unknown) {}

  async complete<T>(spec: AiCallSpec, schema: z.ZodType<T>, options?: AiCallOptions<T>): Promise<AiResult<T>> {
    this.calls.push({ spec, options: options as AiCallOptions<unknown> | undefined });
    return {
      data: schema.parse(this.reply),
      usage: { model: "fixture", inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheCreationTokens: 0, costUsd: null, durationMs: 1 },
    };
  }
}

describe("AiRequirementExtractor", () => {
  const source = [
    "TypeScript로 API를 개발합니다.",
    "PostgreSQL 운영 경험이 필요합니다.",
    "AWS 환경에서 일합니다.",
    "장애 대응 경험을 우대합니다.",
  ].join(" ");
  const normalized = { technologies: [], impacts: [], roles: [], conditions: [] };
  const requirement = (quote: string) => ({ label: quote, kind: "must" as const, axis: "other" as const, quote });

  it("원문에 없는 인용을 check가 그 칸의 경로로 돌려주고, 모델은 한 번만 부른다", async () => {
    const reply = {
      requirements: [
        requirement("TypeScript로 API를 개발합니다."),
        requirement("PostgreSQL 운영 경력이 필요합니다."),
        requirement("AWS 환경에서 일합니다."),
        requirement("장애 대응 경험을 우대합니다."),
      ],
      normalized,
    };
    const ai = new StubAiClient(reply);
    const extraction = await new AiRequirementExtractor(ai).extract(source, null);

    expect(ai.calls).toHaveLength(1);
    const check = ai.calls[0]!.options?.check;
    expect(check?.(reply)).toEqual([
      { path: "/requirements/1/quote", problem: expect.stringContaining("원문에 이 문장이 그대로 없습니다") },
    ]);
    // 고친 뒤에도 남은 인용은 저장 직전에 그 항목만 버린다.
    expect(extraction.requirements.map(({ sourceSpan }) => sourceSpan.quote)).toEqual([
      "TypeScript로 API를 개발합니다.",
      "AWS 환경에서 일합니다.",
      "장애 대응 경험을 우대합니다.",
    ]);
  });

  it("고친 뒤에도 원문에서 찾은 인용이 3개 미만이면 결과를 만들 수 없다", async () => {
    const ai = new StubAiClient({
      requirements: [
        requirement("TypeScript로 API를 개발합니다."),
        requirement("지어낸 문장 하나"),
        requirement("지어낸 문장 둘"),
      ],
      normalized,
    });
    await expect(new AiRequirementExtractor(ai).extract(source, null)).rejects.toThrow(AnalysisEvidenceError);
    expect(ai.calls).toHaveLength(1);
  });
});
