import {
  ExplainableMatchSchema,
  type ExplainableMatch,
  type JobRequirements,
} from "@expresso/contracts";

/**
 * 일치도 = 공고가 명시한 요건 중 내 기록이 닿는 것의 비율 (§8.1).
 *
 * 축(기술 · 규모 · 역할 · 조건)은 요건을 묶어 보여주는 분류이고 배점이
 * 아니다. 예전에는 축마다 만점을 두고 가중 합을 냈는데, 그 숫자의 근거를
 * 댈 수 없었다. 공고가 기술을 네 줄 적고 근무 조건을 한 줄 적었다면 그
 * 자체로 기술이 총점에 네 배 들어간다 — 따로 가중할 이유가 없다.
 */

const AXIS_LABEL = {
  technology: "기술 스택",
  impact: "규모·지표",
  role: "역할·연차",
  conditions: "근무 조건",
} as const;

type AxisKey = keyof typeof AXIS_LABEL;

interface Axis {
  required: number;
  covered: number;
  matched: string[];
  missing: string[];
}

function normalized(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("en-US");
}

const YEARS_WANTED = /(\d+)\s*(?:년|\+?\s*years?)\s*(?:이상|차)?/u;

/**
 * 키워드가 기록에 닿는가. 낱말이 그대로 있으면 닿는다.
 *
 * "데이터 분석 3년 이상"은 기록에 같은 문구로 적히지 않는다. 연차는 글이 아니라 경력 기간으로
 * 따지고, 남은 낱말("데이터", "분석")은 글에서 찾는다.
 */
export function keywordMet(keyword: string, source: string, careerYears: number): boolean {
  const wanted = normalized(keyword);
  if (source.includes(wanted)) return true;
  const years = YEARS_WANTED.exec(wanted);
  if (!years || careerYears < Number(years[1])) return false;
  return wanted.replace(YEARS_WANTED, " ").replace(/경력|경험/g, " ").split(/\s+/).filter(Boolean).every((word) => source.includes(word));
}

function scoreAxis(source: string, requirements: string[], careerYears: number): Axis {
  const matched = requirements.filter((item) => keywordMet(item, source, careerYears));
  const missing = requirements.filter((item) => !matched.includes(item));
  return {
    required: requirements.length,
    covered: matched.length,
    matched,
    missing,
  };
}

/**
 * 요건을 하나도 읽지 못한 공고는 `null`이다. 만점을 주면 추출기가 약할수록
 * 점수가 높아진다 — 한국어 공고 전체가 100점이 되던 자리다.
 */
export function calculateExplainableMatch(
  jobPostingId: string,
  requirements: JobRequirements,
  recordSearchText: string,
  computedAt: Date,
  careerYears = 0,
): ExplainableMatch | null {
  const source = normalized(recordSearchText);
  const axes = {
    technology: scoreAxis(source, requirements.technologies, careerYears),
    impact: scoreAxis(source, requirements.impacts, careerYears),
    role: scoreAxis(source, requirements.roles, careerYears),
    conditions: scoreAxis(source, requirements.conditions, careerYears),
  };
  const entries = Object.entries(axes) as Array<[AxisKey, Axis]>;
  const required = entries.reduce((sum, [, axis]) => sum + axis.required, 0);
  if (required === 0) return null;
  const covered = entries.reduce((sum, [, axis]) => sum + axis.covered, 0);

  // 이유는 충족률이 가장 낮은 축에서 뽑는다. 요구가 없는 축은 후보가 아니다.
  const weakest = entries
    .filter(([, axis]) => axis.required > 0)
    .sort((left, right) =>
      left[1].covered / left[1].required - right[1].covered / right[1].required)[0];
  const missing = weakest?.[1].missing[0];
  const reason = missing && weakest
    ? `${AXIS_LABEL[weakest[0]]}에서 ${missing} 근거가 비어 있습니다.`
    : `요건 ${required}개의 근거가 모두 기록에서 확인됩니다.`;
  const nextAction = missing
    ? `${missing} 근거가 드러나는 기록을 추가하거나 기존 기록의 원문 근거를 보강하세요.`
    : "가장 관련 있는 기록을 포트폴리오 재료로 검토하세요.";

  return ExplainableMatchSchema.parse({
    jobPostingId,
    total: Math.round((100 * covered) / required),
    covered,
    required,
    axes,
    reason,
    nextAction,
    computedAt: computedAt.toISOString(),
  });
}
