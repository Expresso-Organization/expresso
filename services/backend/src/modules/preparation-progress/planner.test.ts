import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { UpdateTaskProgressSchema, type ProgressTask } from "@expresso/contracts";
import { scheduleRemaining } from "./planner.js";
function task(status: ProgressTask["status"] = "not_started"): ProgressTask { return { id: randomUUID(), gapId: randomUUID(), requirement: "Java", kind: "learn", week: 1, date: "2026-10-14", minutes: 60, title: "실습", action: "구현", deliverable: "예제", status, note: "", outcome: "", outcomeUrl: "", spentMinutes: 0, updatedAt: new Date().toISOString() }; }
const settings = { weeklyHours: 1, weeks: 4, startDate: "2026-10-21" };
describe("remaining schedule", () => {
  it("excludes completed work and preserves input", () => { const tasks = [task("completed"), task(), task("blocked")]; const before = structuredClone(tasks); expect(scheduleRemaining(tasks, settings).map(x => x.taskId)).toEqual(tasks.slice(1).map(x => x.id)); expect(tasks).toEqual(before); });
  it("keeps task order across weekly capacity", () => { const tasks = [task(), task(), task()]; expect(scheduleRemaining(tasks, settings).map(x => [x.week, x.date])).toEqual([[1,"2026-10-21"],[2,"2026-10-28"],[3,"2026-11-04"]]); });
  it("includes work already in progress", () => { expect(scheduleRemaining([task("in_progress")], settings)).toHaveLength(1); });
  it("rejects insufficient total capacity", () => { expect(() => scheduleRemaining([task(),task()], {...settings, weeks: 1})).toThrow("insufficient time"); });
  it("rejects all completed work", () => { expect(() => scheduleRemaining([task("completed")], settings)).toThrow("all tasks completed"); });
  it("packs multiple tasks within one week", () => { expect(scheduleRemaining([task(),task(),task()], {...settings,weeklyHours:3}).map(x=>x.week)).toEqual([1,1,1]); });
});
describe("progress validation", () => {
 const base = {requestId:randomUUID(),expectedVersion:1,status:"completed",note:"",outcome:"",outcomeUrl:"",spentMinutes:30};
 it("requires an outcome for completion",()=>expect(UpdateTaskProgressSchema.safeParse(base).success).toBe(false));
 it("accepts a described outcome",()=>expect(UpdateTaskProgressSchema.safeParse({...base,outcome:"예제 실행 확인"}).success).toBe(true));
 it("accepts an HTTPS outcome link",()=>expect(UpdateTaskProgressSchema.safeParse({...base,outcomeUrl:"https://example.com/result"}).success).toBe(true));
 it("rejects script URLs",()=>expect(UpdateTaskProgressSchema.safeParse({...base,outcomeUrl:"javascript:alert(1)"}).success).toBe(false));
 it("does not require outcomes for ongoing work",()=>expect(UpdateTaskProgressSchema.safeParse({...base,status:"in_progress"}).success).toBe(true));
 it("rejects negative actual time",()=>expect(UpdateTaskProgressSchema.safeParse({...base,outcome:"결과",spentMinutes:-1}).success).toBe(false));
});
