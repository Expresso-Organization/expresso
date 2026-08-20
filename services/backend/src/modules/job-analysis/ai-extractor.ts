import {
  JobAnalysisAiOutputSchema,
  JobAnalysisExtractionSchema,
  type ExtractedRequirement,
  type JobAnalysisExtraction,
} from "@expresso/contracts";

import type { AiClient } from "../../platform/ai/client.js";
import type { RequirementExtractor } from "./extractor.js";
import { AnalysisEvidenceError } from "./source-span.js";

/**
 * §8.3 「채용 공고 분석」 계약.
 *
 * 모델에게 **글자 위치를 세라고 하지 않는다.** 인용문만 받고 위치는 원문에서
 * 우리가 찾는다 — 모델은 오프셋 계산을 안정적으로 못 하고, 틀리면 DB 트리거가
 * 전부 거절해 분석이 통째로 실패한다. 인용이 원문에 없으면 그 항목만 버린다
 * (§8.3 환각 방지 ②: "불일치 시 해당 항목을 드롭").
 */

/** 프롬프트를 고치면 올린다. 픽스처 키와 산출물 버전이 함께 갈린다. */
export const JOB_ANALYSIS_PROMPT_VERSION = 2;

const SYSTEM = [
  "너는 채용 공고에서 지원자가 충족해야 할 요건을 뽑아내는 추출기다.",
  "",
  "규칙:",
  "1. 공고에 적힌 것만 뽑는다. 업계 상식으로 보충하거나 추측하지 않는다.",
  "2. quote는 공고 원문에서 **한 글자도 바꾸지 않고** 그대로 잘라 온다.",
  "   줄바꿈·공백·문장부호를 손대면 그 항목은 버려진다.",
  "3. label은 그 요건을 짧게 정리한 말이다. 원문 그대로여도 되고 줄여도 된다.",
  "4. kind — must는 자격 요건, nice는 우대 사항, tone은 일하는 방식·문화.",
  "5. axis — 그 요건이 무엇을 묻는지로 하나 고른다.",
  "   technology: 기술·도구·언어",
  "   impact: 규모·지표·성과",
  "   role: 역할·직무·연차",
  "   conditions: 근무지·고용 형태·근무 형태",
  "   other: 위 넷 중 어디에도 확실히 안 붙을 때. **애매하면 other를 쓴다.**",
  "6. normalized는 일치도 계산에 쓰는 짧은 키워드 목록이다.",
  "   공고가 명시한 것만 넣는다. 없으면 빈 배열로 둔다.",
  "",
  "요건은 중요한 것부터 3–8개. 같은 내용을 두 번 넣지 않는다.",
  "",
  "label을 쓸 때(§8.3 품질 기준):",
  "- 그 공고에만 해당하는 말로 쓴다. \"관련 경험\", \"커뮤니케이션 능력\" 같은",
  "  어느 공고에나 붙는 말로 뭉개지 않는다.",
  "- 숫자와 고유명사를 살린다. 원문에 \"일 3,000만 건\", \"Airflow\"가 있으면",
  "  label에도 남긴다 — 줄이다 지워버리면 뒤에서 아무것도 대조할 수 없다.",
].join("\n");

function buildPrompt(source: string): string {
  return `다음 채용 공고에서 요건을 뽑아라.\n\n---\n${source}\n---`;
}

/** 코드 포인트 기준으로 인용문의 자리를 찾는다. DB 트리거가 같은 기준으로 본다. */
function locate(source: string, quote: string): { start: number; end: number } | null {
  const index = source.indexOf(quote);
  if (index < 0) return null;
  const start = Array.from(source.slice(0, index)).length;
  return { start, end: start + Array.from(quote).length };
}

export class AiRequirementExtractor implements RequirementExtractor {
  readonly #ai: AiClient;

  constructor(ai: AiClient) {
    this.#ai = ai;
  }

  async extract(source: string): Promise<JobAnalysisExtraction> {
    const { data } = await this.#ai.complete(
      {
        contract: "job_analysis",
        system: SYSTEM,
        prompt: buildPrompt(source),
        promptVersion: JOB_ANALYSIS_PROMPT_VERSION,
      },
      JobAnalysisAiOutputSchema,
    );

    const requirements: ExtractedRequirement[] = [];
    const seen = new Set<string>();
    for (const item of data.requirements) {
      const span = locate(source, item.quote);
      // 원문에 없는 인용은 지어낸 근거다. 그 항목만 버린다.
      if (!span) continue;
      // 같은 자리를 두 번 가리키면 한 번만 남긴다.
      const key = `${item.kind}:${span.start}:${span.end}`;
      if (seen.has(key)) continue;
      seen.add(key);
      requirements.push({
        label: item.label,
        kind: item.kind,
        axis: item.axis,
        sourceSpan: { start: span.start, end: span.end, quote: item.quote },
      });
      if (requirements.length === 6) break;
    }

    if (requirements.length < 3) {
      throw new AnalysisEvidenceError(
        `원문에서 확인된 요건이 ${requirements.length}개뿐입니다`
        + ` (모델은 ${data.requirements.length}개를 냈습니다).`,
      );
    }

    return JobAnalysisExtractionSchema.parse({
      requirements,
      normalized: data.normalized,
    });
  }
}
