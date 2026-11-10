import { setTimeout as delay } from "node:timers/promises";

type RunSnapshot = { run?: { status: string; error?: string | null } | null };
/** 실제 실패는 즉시 드러내고, DB 부하로 아직 실행 중인 경우에만 제한된 시간 동안 기다립니다. */
export async function waitForAgentRun(
  read: () => Promise<RunSnapshot>, expected: "complete" | "failed",
  options: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const deadline = Date.now() + timeoutMs;
  let last: RunSnapshot = {};
  do {
    last = await read();
    if (last.run?.status === expected) return;
    if (last.run && ["complete", "failed", "cancelled", "interrupted"].includes(last.run.status)) {
      throw new Error(`Agent expected ${expected}, received ${last.run.status}: ${last.run.error ?? "no error detail"}`);
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await delay(Math.min(options.intervalMs ?? 100, remaining));
  } while (Date.now() <= deadline);
  throw new Error(`Agent did not reach ${expected} within ${timeoutMs}ms; last status=${last.run?.status ?? "missing"}; error=${last.run?.error ?? "none"}`);
}
