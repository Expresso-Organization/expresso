import { JobFactsAiOutputSchema, type JobFactsAiOutput } from "@expresso/contracts";

import type { AiClient } from "../../../platform/ai/client.js";

/**
 * 공고 본문에서 연봉 · 경력 · 근무 형태를 읽는다.
 *
 * 처음에는 정규식으로 만들었다. 결정적이고 공짜라는 이유였는데, 두 가지가
 * 드러나서 걷어냈다.
 *
 * **하나. 규칙이 이미 지어내고 있었다.** 지역별 연봉 구간이 여럿일 때 가장 낮은
 * 바닥과 가장 높은 천장을 붙여 `$170,000–$386,400`을 만들었는데, 그 숫자 쌍은
 * 공고 어디에도 없다. 경력도 "본문에서 처음 나온 것"이라는 규칙이라, 자격 요건이
 * 그 순서로 안 적힌 공고에서는 엉뚱한 연차를 골랐다.
 *
 * **둘. 규칙이 한 회사 템플릿에 붙어 있었다.** 근무 형태를 읽은 28건이 전부
 * 쿠팡이었다 — `Type of work model`이 쿠팡 공고의 문구였기 때문이다. 당근 ·
 * 몰로코 · 크래프톤 · 센드버드 50건에서는 0건이었다.
 *
 * 그래서 모델이 읽는다. 대신 **모델이 내놓은 것을 그대로 믿지 않는다** —
 * 값마다 원문에서 잘라 온 인용을 함께 받고, 그 인용이 정말 원문에 있는지,
 * 값에 쓴 숫자가 정말 그 인용 안에 있는지 우리가 다시 본다. 요건 추출이
 * `source_span`으로 지키는 규율과 같다(§8.3 환각 방지 ②).
 *
 * 검증에 걸리면 그 항목만 버린다. 그래서 화면은 "본문에서 찾지 못했습니다"라고
 * 말하게 되는데, 지어낸 연봉을 보여주는 것보다 그게 낫다.
 */

export type PostingFacts = {
  /** "$164,000–$282,000" · "회사 내규에 따름" */
  salaryNote: string | null;
  /** "5년 이상" · "3~5년" */
  experienceNote: string | null;
  /** "하이브리드" · "재택 · 출근" */
  workType: string | null;
};

export const EMPTY_FACTS: PostingFacts = {
  salaryNote: null,
  experienceNote: null,
  workType: null,
};

/** 프롬프트를 고치면 올린다. 픽스처 키가 함께 갈린다. */
export const JOB_FACTS_PROMPT_VERSION = 2;

/**
 * 아래 "이건 아니다" 목록은 짐작이 아니라 **모아 둔 공고 162건에서 실제로 걸린
 * 것들**이다. 규칙으로 만들었을 때 넷 다 오탐이었다.
 */
const SYSTEM = [
  "너는 채용 공고에서 **연봉 · 경력 · 근무 형태** 세 가지만 읽어 내는 추출기다.",
  "",
  "규칙:",
  "1. 공고에 적힌 것만 읽는다. 없으면 null이다. 업계 상식으로 채우지 않는다.",
  "2. quote는 공고 원문에서 **한 글자도 바꾸지 않고** 그대로 잘라 온다.",
  "   value에 쓴 숫자는 전부 그 quote 안에 있어야 한다. 아니면 그 항목은 버려진다.",
  "3. **공고의 오타를 고치지 않는다.** `$174,00/year`라고 적혀 있으면 그 금액은",
  "   읽을 수 없는 것이다 — null로 둔다. $174,000인지 $17,400인지 알 수 없다.",
  "",
  "salary — 연봉",
  "- value는 한 줄로 짧게. `$164,000–$282,000` · `회사 내규에 따름` · `면접 후 결정`.",
  "- 지역별로 구간이 여럿이면 가장 낮은 바닥과 가장 높은 천장으로 묶고 뒤에",
  "  ` (지역별)`을 붙인다. quote에는 그 두 숫자가 다 들어가야 한다.",
  "- 교육비 · 상금 · 사이닝 보너스 같은 다른 돈은 연봉이 아니다.",
  "",
  "experience — 경력",
  "- 한국어로 쓴다. `5년 이상` · `3~5년` · `4년`.",
  "- 원문에 `이상`·`+`·`minimum`이 없으면 붙이지 않는다. `4 years`는 `4년`이다.",
  "- `5-12+ years`는 `5~12년`이다. `12년 이상`이 아니다 — 5년차도 지원할 수 있다.",
  "- 한 자리 안에서 조건이 겹치면 **핵심 요건**을 고른다. `개발 경험 10년 이상`",
  "  옆에 `관리 경험 2년 이상`이 있으면 10년이다.",
  "- 한 공고가 여러 직급을 함께 뽑으면(`Basic Qualifications (2 Titles)`)",
  "  **가장 낮은 요건**을 쓴다. 읽는 사람은 지원할 수 있는지부터 알아야 한다.",
  "  고르지 못하겠다고 null을 내지 마라 — 그러면 아무것도 알려주지 못한다.",
  "- 이건 경력이 아니다: 학위, 수습 기간(`3개월`), 주식 베스팅(`1-year cliff`),",
  "  서류 보관 기간(`180일간 보관`).",
  "",
  "workType — 근무 형태",
  "- `재택` · `출근` · `하이브리드` 중에서 고르고, 여럿이면 ` · `로 잇는다.",
  "- **이 자리의 근무 형태만** 읽는다. 이건 근무 형태가 아니다:",
  "  - 전형 절차 — `Onsite (or Virtual Onsite) Interview`",
  "  - 기술·설비 — `Hybrid Cloud environments`, `Hybrid Cooling`,",
  "    `zero-trust remote access infrastructure`",
  "  - 지원자에게 바라는 역량 — `Remote/Hybrid Expertise`",
].join("\n");

export interface FactsReader {
  read(body: string): Promise<PostingFacts>;
}

export class AiFactsReader implements FactsReader {
  readonly #ai: AiClient;

  constructor(ai: AiClient) {
    this.#ai = ai;
  }

  async read(body: string): Promise<PostingFacts> {
    const { data } = await this.#ai.complete(
      {
        contract: "job_facts",
        system: SYSTEM,
        prompt: `다음 채용 공고에서 연봉 · 경력 · 근무 형태를 읽어라.\n\n---\n${body}\n---`,
        promptVersion: JOB_FACTS_PROMPT_VERSION,
      },
      JobFactsAiOutputSchema,
    );
    return verifyFacts(body, data);
  }
}

/**
 * 모델이 낸 값을 원문과 대조한다.
 *
 * 두 가지를 본다.
 *
 * 1. **인용이 원문에 그대로 있는가.** 없으면 지어낸 근거다.
 * 2. **값에 쓴 숫자가 그 인용 안에 있는가.** 인용은 진짜인데 값만 손본 경우를
 *    잡는다 — `$174,00/year to $299,000/year`를 인용해 놓고 `$174,000`이라고
 *    적는 것이 정확히 이 경우다.
 *
 * 숫자를 원문 전체가 아니라 **인용 안에서** 찾는 것이 중요하다. 긴 공고에는
 * `174,000`과 비슷한 숫자가 어딘가 있기 마련이고, 그러면 검사가 무력해진다.
 */
export function verifyFacts(body: string, draft: JobFactsAiOutput): PostingFacts {
  return {
    salaryNote: check(body, draft.salary),
    experienceNote: check(body, draft.experience),
    workType: check(body, draft.workType),
  };
}

function check(body: string, fact: JobFactsAiOutput["salary"]): string | null {
  if (!fact) return null;
  const value = fact.value.trim();
  if (!value) return null;
  if (!quoted(body, fact.quote)) return null;
  for (const number of numbers(value)) {
    if (!numbers(fact.quote).includes(number)) return null;
  }
  return value;
}

/**
 * 인용이 원문에 있는가.
 *
 * 글자는 그대로여야 하지만 **강조 표시는 봐 준다.** 원문이
 * `**7년 이상의 소프트웨어 개발 경력** 또는…`일 때 모델은 별표를 빼고 인용한다 —
 * 사람이 읽는 글자는 똑같고, 별표는 마크다운 마크업이지 공고가 쓴 글자가 아니다.
 *
 * 이걸 봐 줘도 지어낸 문장이 새어 들지는 않는다. 별표를 뺀 나머지 글자가
 * 순서까지 그대로 원문에 있어야 하는 것은 같다.
 */
function quoted(body: string, quote: string): boolean {
  if (body.includes(quote)) return true;
  return plain(body).includes(plain(quote));
}

function plain(value: string): string {
  return value.replace(/[*_`]/g, "");
}

/** 자릿점을 뗀 숫자들. `$164,000–$282,000` → `["164000", "282000"]` */
function numbers(value: string): string[] {
  return [...value.matchAll(/\d[\d,]*(?:\.\d+)?/g)].map((match) =>
    match[0].replace(/,/g, "").replace(/\.0+$/, ""),
  );
}
