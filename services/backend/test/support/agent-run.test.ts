import { expect, it, vi } from "vitest";
import { waitForAgentRun } from "./agent-run.js";
it("running 뒤 완료를 기다린다", async () => {
 let count = 0;
 await waitForAgentRun(async () => ({ run: { status: ++count < 3 ? "running" : "complete" } }), "complete", { intervalMs: 1 });
 expect(count).toBe(3);
});
it("실제 실패를 제한 시간까지 숨기지 않는다", async () => {
 const read = vi.fn(async () => ({ run: { status: "failed", error: "consent denied" } }));
 await expect(waitForAgentRun(read, "complete")).rejects.toThrow("consent denied"); expect(read).toHaveBeenCalledOnce();
});
it("실패가 기대된 검사는 failed일 때 통과한다", async () => {
 await expect(waitForAgentRun(async () => ({ run: { status: "failed" } }), "failed")).resolves.toBeUndefined();
});
it("계속 실행 중이면 상한에서 마지막 상태를 알린다", async () => {
 await expect(waitForAgentRun(async () => ({ run: { status: "running" } }), "complete", { timeoutMs: 10, intervalMs: 1 })).rejects.toThrow("last status=running");
});
it("취소를 정상 완료로 취급하지 않는다", async () => {
 await expect(waitForAgentRun(async () => ({ run: { status: "cancelled" } }), "complete")).rejects.toThrow("received cancelled");
});
