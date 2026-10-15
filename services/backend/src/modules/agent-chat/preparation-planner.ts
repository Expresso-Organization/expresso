import { randomUUID } from "node:crypto";
import type { GapReview, PreparationSettings, PreparationTask, PreparationTaskDraft } from "@expresso/contracts";

type Gap = GapReview["items"][number];
type Step = Pick<PreparationTaskDraft, "kind" | "minutes" | "title" | "action" | "deliverable">;

/** 계획에 넣을 시간이 모자라다. 필요한 시간을 함께 알려 사용자가 설정을 고르게 한다. */
export class PlanCapacityError extends Error {
  constructor(readonly neededMinutes: number, readonly availableMinutes: number) { super("insufficient time"); }
}

/**
 * 보완점 종류별 작업 단계와 시간(분).
 *
 * 값은 이전 준비 계획 구현(PR 70)의 단계표를 그대로 가져온 것이다. 측정한 근거가 있는 값이
 * 아니라, 작업을 30분 · 60분 단위로 나눠 주 단위로 채우기 위한 배치 단위다.
 */
const MINUTES = { confirm: 30, learn: 60, project: 60, check: 60, qualification: 30, portfolio: 60 } as const;

function steps(gap: Gap): Step[] {
  const requirement = gap.requirement.slice(0, 240);
  const suggestion = gap.suggestedAction.slice(0, 1_500);
  if (gap.status === "needs_confirmation") return [{ kind: "confirm", minutes: MINUTES.confirm, title: `${requirement}: 경험 · 조건 확인`, action: `관련 경험이나 조건을 갖췄는지 먼저 확인합니다. 기록에 없다는 것만으로 부족하다고 보지 않습니다. 확인할 것: ${suggestion}`, deliverable: "실제 경험 · 맡은 일 · 결과, 또는 경험이 없다는 확인. 확인한 내용은 기록으로 남깁니다." }];
  if (gap.type === "skill" || gap.type === "experience") return [
    { kind: "learn", minutes: MINUTES.learn, title: `${requirement}: 기초 확인`, action: `보완 목표를 작은 단위로 나누고 지금 이해도를 확인합니다. 제안: ${suggestion}`, deliverable: "익힐 핵심 개념과 직접 만들어 볼 최소 기능 목록" },
    { kind: "project", minutes: MINUTES.project, title: `${requirement}: 작은 예제 착수`, action: "앞 단계의 최소 기능 하나를 직접 구현하거나 실습합니다. 시간 안에 끝내지 못하면 남은 일과 막힌 점을 적습니다.", deliverable: "실행되는 작은 예제, 또는 시도한 코드와 남은 문제" },
    { kind: "check", minutes: MINUTES.check, title: `${requirement}: 검증 · 맡은 부분 정리`, action: "예제를 실행해 확인하고, 직접 만든 부분과 참고한 부분을 나눠 적습니다. 이 작업만으로 요건을 채웠다고 판단하지 않습니다.", deliverable: "실행 결과 · 테스트 기록 · 본인이 한 일 · 다음 보완 작업" },
  ];
  if (gap.type === "qualification") return [{ kind: "check", minutes: MINUTES.qualification, title: `${requirement}: 자격 조건 확인`, action: "공고의 정확한 자격 조건과 지금 상태를 확인하고, 필요한 절차나 대신 지원할 만한 공고를 정리합니다. 취득 기간을 미리 약속하지 않습니다.", deliverable: "지금 조건 · 필요한 증빙 · 더 확인할 것, 또는 대신 지원할 공고의 조건" }];
  if (gap.type === "portfolio") return [{ kind: "portfolio", minutes: MINUTES.portfolio, title: `${requirement}: 포트폴리오 항목 초안`, action: `확인된 경험으로 맡은 일 · 구현 · 결과 · 산출물을 정리합니다. 제안: ${suggestion}`, deliverable: "포트폴리오 항목 초안과 근거 링크" }];
  return [{ kind: "confirm", minutes: MINUTES.confirm, title: `${requirement}: 경험 근거 보완`, action: suggestion, deliverable: "본인이 한 역할 · 행동 · 결과를 나눈 답, 또는 이미 있는 자료" }];
}

/** 시작일에서 n주 뒤의 날짜. 달력 날짜만 다루므로 시간대가 끼어들지 않게 UTC 날짜로 센다. */
export function weekDate(startDate: string, week: number) {
  const date = new Date(`${startDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + (week - 1) * 7);
  return date.toISOString().slice(0, 10);
}

/** 앞에서부터 주 단위로 채운다. 한 주에 다 들어가지 않으면 다음 주로 넘긴다. */
function pack<T extends { minutes: number }>(items: T[], settings: PreparationSettings) {
  const capacity = settings.weeklyHours * 60;
  const needed = items.reduce((sum, item) => sum + item.minutes, 0);
  if (needed > capacity * settings.weeks) throw new PlanCapacityError(needed, capacity * settings.weeks);
  let week = 1; let used = 0;
  return items.map(item => {
    if (used + item.minutes > capacity) { week += 1; used = 0; }
    if (week > settings.weeks) throw new PlanCapacityError(needed, capacity * settings.weeks);
    used += item.minutes;
    return { item, week, date: weekDate(settings.startDate, week) };
  });
}

/** 자격 확인 → 확인 필요 → 우선순위 순으로 줄 세워 배치한다. */
export function buildPreparationTasks(gaps: Gap[], settings: PreparationSettings): PreparationTaskDraft[] {
  const priority = { high: 0, medium: 1, low: 2 };
  const sorted = [...gaps].sort((a, b) => Number(b.type === "qualification") - Number(a.type === "qualification") || Number(b.status === "needs_confirmation") - Number(a.status === "needs_confirmation") || priority[a.priority] - priority[b.priority]);
  const pending = sorted.flatMap(gap => steps(gap).map(step => ({ gap, ...step })));
  return pack(pending, settings).map(({ item: { gap, ...step }, week, date }) => ({ id: randomUUID(), gapId: gap.id, requirement: gap.requirement, ...step, week, date }));
}

/** 완료하지 않은 작업(진행 중 · 막힘 포함)만 순서를 지켜 다시 배치한다. */
export function scheduleRemaining(tasks: readonly PreparationTask[], settings: PreparationSettings) {
  const remaining = tasks.filter(task => task.status !== "completed");
  if (!remaining.length) return [];
  return pack(remaining, settings).map(({ item, week, date }) => ({ taskId: item.id, week, date }));
}
