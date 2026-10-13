import type { PreparationSettings, ProgressTask, ReplanSlot } from "@expresso/contracts";
export class ProgressError extends Error { constructor(readonly statusCode: number, message: string) { super(message); this.name = "ProgressError"; } }
export function scheduleRemaining(tasks: ProgressTask[], settings: PreparationSettings): ReplanSlot[] {
  const remaining = tasks.filter((task) => task.status !== "completed");
  if (!remaining.length) throw new ProgressError(422, "all tasks completed");
  if (remaining.reduce((sum, task) => sum + task.minutes, 0) > settings.weeklyHours * 60 * settings.weeks) throw new ProgressError(422, "insufficient time");
  let week = 1; let used = 0;
  return remaining.map((task) => {
    if (used + task.minutes > settings.weeklyHours * 60) { week++; used = 0; }
    if (week > settings.weeks) throw new ProgressError(422, "weekly slots insufficient");
    used += task.minutes;
    const date = new Date(`${settings.startDate}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + (week - 1) * 7);
    return { taskId: task.id, week, date: date.toISOString().slice(0, 10), minutes: task.minutes };
  });
}
