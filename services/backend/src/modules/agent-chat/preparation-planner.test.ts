import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { PreparationTaskDraftSchema, type GapReview, type PreparationTask } from "@expresso/contracts";
import { buildPreparationTasks, PlanCapacityError, scheduleRemaining, weekDate } from "./preparation-planner.js";

type Gap = GapReview["items"][number];
const gap = (overrides: Partial<Gap> = {}): Gap => ({ id: randomUUID(), requirementIndex: 0, requirement: "Java 프로젝트", jobQuote: "Java", type: "skill", status: "needs_improvement", priority: "high", explanation: "설명", evidence: [], suggestedAction: "작은 API 실습", ...overrides });
const settings = { weeklyHours: 1, weeks: 4, startDate: "2026-10-14" };
const task = (status: PreparationTask["status"] = "not_started"): PreparationTask => ({ id: randomUUID(), gapId: randomUUID(), requirement: "Java", kind: "learn", week: 1, date: "2026-10-14", minutes: 60, title: "실습", action: "구현", deliverable: "예제", status, note: "", outcome: "", outcomeUrl: "", spentMinutes: 0, updatedAt: "2026-10-15T00:00:00.000Z" });

describe("준비 계획 배치", () => {
  it("확인 필요 보완점은 확인 작업 하나(30분)만 둔다", () => {
    const tasks = buildPreparationTasks([gap({ status: "needs_confirmation" })], settings);
    expect(tasks.map(item => [item.kind, item.minutes])).toEqual([["confirm", 30]]);
  });
  it("기술 보완은 기초 · 예제 · 검증으로 나눠 주마다 채운다", () => {
    const tasks = buildPreparationTasks([gap()], settings);
    expect(tasks.map(item => item.kind)).toEqual(["learn", "project", "check"]);
    expect(tasks.map(item => [item.week, item.date])).toEqual([[1, "2026-10-14"], [2, "2026-10-21"], [3, "2026-10-28"]]);
  });
  it("시간이 모자라면 자르지 않고 필요한 시간을 알린다", () => {
    try { buildPreparationTasks([gap()], { ...settings, weeks: 1 }); expect.unreachable(); }
    catch (error) { expect(error).toBeInstanceOf(PlanCapacityError); expect((error as PlanCapacityError).neededMinutes).toBe(180); expect((error as PlanCapacityError).availableMinutes).toBe(60); }
  });
  it("자격 확인을 기술보다 먼저 둔다", () => {
    const qualification = gap({ type: "qualification", priority: "low" });
    expect(buildPreparationTasks([gap(), qualification], settings)[0]!.gapId).toBe(qualification.id);
  });
  it("작업은 고른 보완점에서만 나오고 제안 문구를 옮기며 id가 서로 다르다", () => {
    const selected = gap();
    const tasks = buildPreparationTasks([selected], settings);
    expect(tasks.every(item => item.gapId === selected.id && item.requirement === selected.requirement)).toBe(true);
    expect(tasks[0]!.action).toContain("작은 API 실습");
    expect(new Set(tasks.map(item => item.id)).size).toBe(tasks.length);
  });
  it("작업 문구는 끝마침이나 충족을 약속하지 않는다", () => {
    const tasks = buildPreparationTasks([gap()], settings);
    expect(tasks[1]!.action).toContain("끝내지 못하면");
    expect(tasks[2]!.action).toContain("판단하지 않습니다");
  });
  it("긴 요건 · 제안도 계약 길이 안에 든다", () => {
    buildPreparationTasks([gap({ requirement: "가".repeat(300), suggestedAction: "나".repeat(600) })], settings).forEach(item => expect(PreparationTaskDraftSchema.safeParse(item).success).toBe(true));
  });
  it("달력 날짜만 더한다", () => {
    expect(weekDate("2026-12-28", 2)).toBe("2027-01-04");
  });
});

describe("남은 작업 재배치", () => {
  it("완료한 작업은 빼고 입력을 바꾸지 않는다", () => {
    const tasks = [task("completed"), task(), task("blocked")]; const before = structuredClone(tasks);
    expect(scheduleRemaining(tasks, settings).map(item => item.taskId)).toEqual(tasks.slice(1).map(item => item.id));
    expect(tasks).toEqual(before);
  });
  it("순서를 지켜 주마다 채운다", () => {
    expect(scheduleRemaining([task(), task(), task()], { ...settings, startDate: "2026-10-21" }).map(item => [item.week, item.date])).toEqual([[1, "2026-10-21"], [2, "2026-10-28"], [3, "2026-11-04"]]);
  });
  it("진행 중인 작업도 다시 배치한다", () => { expect(scheduleRemaining([task("in_progress")], settings)).toHaveLength(1); });
  it("시간이 모자라면 알린다", () => { expect(() => scheduleRemaining([task(), task()], { ...settings, weeks: 1 })).toThrow(PlanCapacityError); });
  it("모두 끝났으면 배치할 것이 없다", () => { expect(scheduleRemaining([task("completed")], settings)).toEqual([]); });
  it("한 주에 여러 작업을 담는다", () => { expect(scheduleRemaining([task(), task(), task()], { ...settings, weeklyHours: 3 }).map(item => item.week)).toEqual([1, 1, 1]); });
});
