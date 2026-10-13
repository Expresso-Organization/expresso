import { randomUUID } from "node:crypto";
import type { CareerGapItem, PreparationSettings, PreparationTask } from "@expresso/contracts";
import { PreparationError } from "./public.js";
export const PREPARATION_GENERATOR_VERSION = 1;
type Step = Pick<PreparationTask, "kind" | "minutes" | "title" | "action" | "deliverable">;
function steps(gap: CareerGapItem): Step[] {
  if (gap.status === "needs_confirmation") return [{ kind: "confirm", minutes: 30, title: `${gap.requirement.slice(0, 240)}: 경험·조건 확인`, action: `먼저 관련 경험이나 조건 충족 여부를 확인하세요. 미기록을 실제 부족으로 단정하지 않습니다. 확인할 내용: ${gap.suggestedAction.slice(0, 1500)}`, deliverable: "실제 경험·기여·결과 또는 경험이 없다는 확인 답변. 확인 후 P5/P3/P6를 갱신하고 계획을 다시 만드세요." }];
  if (gap.type === "skill" || gap.type === "experience") return [
    { kind: "learn", minutes: 60, title: `${gap.requirement.slice(0, 240)}: 기초 확인`, action: `보완 목표를 작은 단위로 나누고 현재 이해도를 확인합니다. P6 제안: ${gap.suggestedAction.slice(0, 1500)}`, deliverable: "학습할 핵심 개념과 구현할 최소 기능 목록" },
    { kind: "project", minutes: 60, title: `${gap.requirement.slice(0, 240)}: 최소 예제 착수`, action: "앞 단계의 최소 기능 하나를 직접 구현하거나 실습합니다. 완료할 수 없으면 남은 작업과 문제를 기록하세요.", deliverable: "실행 가능한 작은 예제 또는 시도한 코드·남은 문제" },
    { kind: "check", minutes: 60, title: `${gap.requirement.slice(0, 240)}: 검증·기여 정리`, action: "예제를 실행·검증하고 직접 구현한 부분과 참고한 부분을 구분합니다. 전체 기술 숙련이나 공고 충족을 자동 확정하지 않습니다.", deliverable: "실행 결과·테스트 기록·본인 역할·다음 보완 작업" },
  ];
  if (gap.type === "qualification") return [{ kind: "check", minutes: 30, title: `${gap.requirement.slice(0, 240)}: 자격 조건 확인`, action: "공고의 정확한 자격 조건과 현재 상태를 확인하고 필요한 절차 또는 대체 공고를 정리합니다. 자격 취득 가능 기간을 임의로 약속하지 않습니다.", deliverable: "현재 조건·필요 증빙·추가 확인 사항 또는 대체 공고 조건" }];
  if (gap.type === "portfolio") return [{ kind: "portfolio", minutes: 60, title: `${gap.requirement.slice(0, 240)}: 구성 초안`, action: `확인된 경험을 바탕으로 역할·구현·결과·산출물을 정리합니다. P6 제안: ${gap.suggestedAction.slice(0, 1500)}`, deliverable: "포트폴리오 항목 초안과 근거 링크. P9에서 실제 구성으로 연결합니다." }];
  return [{ kind: "confirm", minutes: 30, title: `${gap.requirement.slice(0, 240)}: 경험 근거 보완`, action: gap.suggestedAction, deliverable: "본인이 수행한 역할·행동·결과를 구분한 답변 또는 기존 자료" }];
}
export function buildPreparationTasks(gaps: CareerGapItem[], settings: PreparationSettings): PreparationTask[] {
  const priority = { high: 0, medium: 1, low: 2 };
  const sorted = [...gaps].sort((a, b) => Number(b.type === "qualification") - Number(a.type === "qualification") || Number(b.status === "needs_confirmation") - Number(a.status === "needs_confirmation") || priority[a.priority] - priority[b.priority]);
  const pending = sorted.flatMap((gap) => steps(gap).map((step) => ({ gap, step })));
  const capacity = settings.weeklyHours * 60;
  const total = pending.reduce((sum, item) => sum + item.step.minutes, 0);
  if (total > capacity * settings.weeks) throw new PreparationError(422, "insufficient time budget");
  let week = 1; let used = 0;
  return pending.map(({ gap, step }) => {
    if (used + step.minutes > capacity) { week++; used = 0; }
    if (week > settings.weeks) throw new PreparationError(422, "tasks do not fit weekly slots");
    used += step.minutes;
    const date = new Date(`${settings.startDate}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + (week - 1) * 7);
    return { id: randomUUID(), gapId: gap.id, requirement: gap.requirement, ...step, week, date: date.toISOString().slice(0, 10) };
  });
}
