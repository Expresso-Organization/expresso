import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { PreparationTaskSchema, type CareerGapItem } from "@expresso/contracts";
import { buildPreparationTasks } from "./planner.js";
function gap(overrides: Partial<CareerGapItem> = {}): CareerGapItem {
  return { id: randomUUID(), requirementIndex: 0, requirement: "Java 프로젝트", type: "skill", status: "needs_improvement", priority: "high", explanation: "테스트", evidence: [], suggestedAction: "작은 API 실습", nextAction: "prepare", ...overrides };
}
const settings = { weeklyHours: 1, weeks: 4, startDate: "2026-10-14" };
describe("Preparation planner", () => {
  it("assigns only confirmation tasks to unknown gaps", () => { const tasks = buildPreparationTasks([gap({ status: "needs_confirmation" })], settings); expect(tasks.map((task) => task.kind)).toEqual(["confirm"]); expect(tasks[0]?.minutes).toBe(30); });
  it("schedules learning, a small project and evidence review within weekly capacity", () => { const tasks = buildPreparationTasks([gap()], settings); expect(tasks.map((task) => task.kind)).toEqual(["learn", "project", "check"]); expect(tasks.map((task) => task.week)).toEqual([1, 2, 3]); expect(tasks.map((task) => task.date)).toEqual(["2026-10-14", "2026-10-21", "2026-10-28"]); });
  it("rejects insufficient time without truncating tasks", () => { expect(() => buildPreparationTasks([gap()], { ...settings, weeks: 1 })).toThrow("insufficient time"); });
  it("prioritizes qualification checks before skills", () => { const qualification = gap({ type: "qualification", requirement: "자격증", priority: "low" }); expect(buildPreparationTasks([gap(), qualification], settings)[0]?.gapId).toBe(qualification.id); });
  it("keeps tasks grounded in selected gaps", () => { const selected = gap(); expect(buildPreparationTasks([selected], settings).every((task) => task.gapId === selected.id && task.requirement === selected.requirement)).toBe(true); });
  it("preserves source suggestion and creates distinct task IDs", () => { const tasks = buildPreparationTasks([gap()], settings); expect(tasks[0]?.action).toContain("작은 API 실습"); expect(new Set(tasks.map((task) => task.id)).size).toBe(tasks.length); });
  it("does not promise completing the entire skill within allocated time", () => { const tasks = buildPreparationTasks([gap()], settings); expect(tasks[1]?.action).toContain("완료할 수 없으면"); expect(tasks[2]?.action).toContain("자동 확정하지"); });
  it("bounds text for long source requirements and suggestions", () => { const tasks = buildPreparationTasks([gap({ requirement: "가".repeat(300), suggestedAction: "나".repeat(2000) })], settings); tasks.forEach((task) => expect(PreparationTaskSchema.safeParse(task).success).toBe(true)); });
});
