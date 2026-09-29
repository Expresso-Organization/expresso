import {
  SearchInterpretAiOutputSchema,
  type JobSearchCondition,
  type JobSearchField,
  type SearchInterpretAiOutput,
} from "@expresso/contracts";

import { AiError, type AiClient } from "../../platform/ai/client.js";
import { normalizeRegion, COUNTRY_OF_REGION, REGION_SUBAREA_HINTS } from "./ingest/classify.js";
// 기술 사전만 가져온다 — 질의 해석(interpretSearchQuery)은 더 이상 쓰지 않는다.
import { TECHNOLOGIES, CANONICAL } from "./search-parser.js";

/**
 * §8.3 「자연어 검색」 계약.
 *
 * `docs/API_GAPS.md`가 "사전이 얕아 계약으로 옮길 값이 있다"고 적어 둔 바로
 * 그 자리다. **규칙 기반 해석(`search-parser.ts`의 `interpretSearchQuery`)은
 * 이 경로에서 더 이상 쓰지 않는다** — 실제 검색은 AI만 쓰고, AI가 꺼져 있으면
 * `NullSearchInterpreter`가 빈 결과를 돌려준다(아래). `search-parser.ts` 자체는
 * 아직 지워지지 않았다 — 쓰이지 않는 legacy MySQL 구현(`legacy-mysql-service.ts`)이
 * 타입 검사를 통과하려면 그 파일이 있어야 하고, 이 파일도 거기서 기술 사전
 * (TECHNOLOGIES · CANONICAL)만 가져와 쓴다.
 *
 * technology · location은 모델에게 자유롭게 쓰게 두지 않는다. 이 두 값은
 * 그대로 실제 필터(정확 일치)로 나가므로, 사전에 없는 표기를 모델이 지어내면
 * "그 값으로는 아무것도 없다"는 결과가 조용히 나온다. 그래서 프롬프트에
 * 아는 사전을 통째로 주고, 거기 없으면 만들지 말라고 하고, 응답도 다시 한 번
 * 그 사전으로 걸러낸다.
 */

export const SEARCH_INTERPRET_PROMPT_VERSION = 3;

export interface SearchInterpreter {
  interpret(query: string): Promise<JobSearchCondition[]>;
}

type AiField = Exclude<JobSearchField, "company_size">;

/** 규칙 폴백(search-parser.ts)이 필드마다 매기던 값을 그대로 가져왔다. */
const DEFAULT_CONFIDENCE: Record<AiField, number> = {
  role: 0.9,
  experience: 0.9,
  work_type: 0.9,
  location: 0.85,
  technology: 0.95,
  salary: 0.6,
};

/** 연봉은 여전히 화면에만 뜨고 실제 필터로는 안 나간다 — 켜 두지 않는다. */
const DEFAULT_ENABLED: Record<AiField, boolean> = {
  role: true,
  experience: true,
  work_type: true,
  location: true,
  technology: true,
  salary: false,
};

const KNOWN_TECHNOLOGIES = Array.from(
  new Set(TECHNOLOGIES.map((technology) => CANONICAL[technology] ?? technology)),
).sort();
const KNOWN_REGIONS = Object.keys(COUNTRY_OF_REGION);

/**
 * "성수" 같은 동네 이름을 검색어에 적었을 때 "서울"로 잡으라고 모델에게
 * 미리 알려주는 힌트다. 이게 없으면 규칙 1(추측 금지)에 걸려 모델이 동네
 * 이름은 지역 목록에 없다는 이유로 아무것도 안 뽑는다 — "성수가 서울에
 * 속한다"는 상식이 아니라 여기서 준 사전을 보고 판단하게 하는 것이다.
 */
const REGION_SUBAREA_HINT_TEXT = Object.entries(REGION_SUBAREA_HINTS)
  .map(([region, subareas]) => `${region}(${subareas.join("·")})`)
  .join(", ");

function buildSystem(): string {
  return [
    "너는 채용 공고 검색창에 사용자가 적은 자연어 검색어를 읽어 구조화된",
    "조건으로 바꾸는 해석기다.",
    "",
    "규칙:",
    "1. 검색어에 실제로 적힌 것만 뽑는다. 업계 상식으로 보충하거나 추측하지",
    "   않는다. 애매하면 만들지 않는다.",
    "2. quote는 검색어 원문에서 이 조건의 근거가 된 부분을 **한 글자도 바꾸지",
    "   않고** 그대로 잘라 온다. 지어낸 quote는 검증에서 버려진다.",
    "3. field:",
    "   role — 직무. 검색어에 쓰인 말을 그대로 짧게 옮긴다(예: \"백엔드\",",
    "   \"frontend\"). 언급 안 됐으면 만들지 않는다.",
    "   experience — 최소 연차. 정수(예: \"3년 이상\"→3, \"신입\"→0).",
    "   work_type — remote · hybrid · on-site 중 하나.",
    "   location — 아래 지역/국가 목록 중 정확히 하나를 고른다. 목록에 없는",
    "   지역이면 만들지 않는다. 단, 지역 밑의 동네 이름이 적혀 있으면(예:",
    `   ${REGION_SUBAREA_HINT_TEXT} 등) 상식이 아니라 이 목록을 보고 그 지역으로`,
    "   적는다 — quote는 동네 이름 그대로 자른다(값은 지역명으로).",
    `   목록: ${KNOWN_REGIONS.join(", ")}`,
    "   technology — 아래 기술 목록 중 정확히 하나를 고른다(표기 그대로).",
    "   목록에 없는 기술이면 만들지 않는다 — 지어내지 않는다.",
    `   목록: ${KNOWN_TECHNOLOGIES.join(", ")}`,
    "   salary — 연봉. \"연봉 6000\"처럼 이미 만 원 단위 숫자면 그 숫자,",
    "   \"연봉 8천\"처럼 '천' 단위면 천 단위를 곱한 값(8000)으로 적는다.",
    "4. 조건은 최대 10개, 서로 다른 field끼리도 여러 개 나올 수 있다(예: 기술",
    "   두 개). 같은 field에 값이 여럿이면 검색어에 언급된 순서대로 모두 적는다.",
  ].join("\n");
}

function buildPrompt(query: string): string {
  return `다음 채용 공고 검색어에서 조건을 뽑아라.\n\n---\n${query}\n---`;
}

/** 사전을 다시 한 번 통과시킨다 — 모델이 규칙을 어겨도 여기서 걸린다. */
function canonicalize(field: AiField, rawValue: string | number): string | number | null {
  if (field === "location") {
    return normalizeRegion(String(rawValue));
  }
  if (field === "technology") {
    const lowered = String(rawValue).normalize("NFKC").toLocaleLowerCase("en-US");
    const canonical = CANONICAL[lowered] ?? lowered;
    return KNOWN_TECHNOLOGIES.includes(canonical) ? canonical : null;
  }
  return rawValue;
}

export class AiSearchInterpreter implements SearchInterpreter {
  readonly #ai: AiClient;

  constructor(ai: AiClient) {
    this.#ai = ai;
  }

  async interpret(query: string): Promise<JobSearchCondition[]> {
    const normalizedQuery = query.normalize("NFKC").toLocaleLowerCase("en-US");

    // AI 호출은 실패할 수 있다(레이트 리밋·타임아웃·스키마 이탈) — 그런데
    // 이 계약은 다른 AI 계약과 달리 실패해도 화면 전체를 죽일 이유가 없다.
    // 검색 결과 자체는 해석 없이도 보여줄 수 있으니, 두 번째 시도까지도
    // 안 되면 NullSearchInterpreter와 똑같이 빈 조건으로 넘어간다 — 검색창
    // 위에 "이렇게 이해했습니다" 줄만 안 뜨고, 나머지 화면은 그대로 산다.
    // AI_INVALID_OUTPUT(모델이 스키마를 벗어남)만 한 번 재시도한다 —
    // question-writer.ts 등 다른 계약과 같은 기준이다. 레이트 리밋·타임아웃은
    // 지금 다시 불러도 똑같이 실패하므로 바로 포기한다.
    let data: SearchInterpretAiOutput | null = null;
    for (const attempt of [1, 2]) {
      try {
        const result = await this.#ai.complete(
          {
            contract: "search_interpret",
            system: buildSystem(),
            prompt: buildPrompt(query),
            promptVersion: SEARCH_INTERPRET_PROMPT_VERSION,
          },
          SearchInterpretAiOutputSchema,
        );
        data = result.data;
        break;
      } catch (error) {
        if (error instanceof AiError && error.code !== "AI_INVALID_OUTPUT") break;
        if (attempt === 2) break;
      }
    }
    if (!data) return [];

    const conditions: JobSearchCondition[] = [];
    const seen = new Set<string>();
    for (const item of data.conditions) {
      // 근거가 검색어 안에 없으면 지어낸 것이다 — 버린다.
      const quote = item.quote.normalize("NFKC").toLocaleLowerCase("en-US");
      if (!normalizedQuery.includes(quote)) continue;

      const field = item.field as AiField;
      const value = canonicalize(field, item.value);
      if (value === null) continue;

      const key = `${field}:${value}`;
      if (seen.has(key)) continue;
      seen.add(key);

      conditions.push({
        field,
        value,
        enabled: DEFAULT_ENABLED[field],
        confidence: DEFAULT_CONFIDENCE[field],
      });
    }
    return conditions;
  }
}

/**
 * AI가 꺼져 있을 때 쓰는 자리. **규칙 폴백을 두지 않는다.**
 *
 * `job_facts`와 같은 이유다(`docs/API_GAPS.md`) — 지어낸 조건보다는 빈 결과가
 * 낫고, 정확도가 조용히 갈리는 두 경로를 화면이 구분해 말할 수 없다. 조건이
 * 비면 검색어를 그대로 텍스트 검색으로 쓰는 길이 이미 있다(프런트의
 * `searchFilters`가 조건이 없을 때 `{ q }`로 돌아간다).
 */
export class NullSearchInterpreter implements SearchInterpreter {
  async interpret(): Promise<JobSearchCondition[]> {
    return [];
  }
}
