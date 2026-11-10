import { describe, expect, it } from "vitest";

import { closeWorkerRuntime } from "./shutdown.js";

describe("closeWorkerRuntime", () => {
  it("처리 중인 잡이 결과를 쓴 뒤에 DB를 닫는다", async () => {
    const events: string[] = [];
    let dbOpen = true;
    // 처리 중인 잡: 닫히기 전에 실패를 DB에 쓴다. DB가 이미 닫혔으면 쓰기가 막힌다.
    const worker = {
      async close(force?: boolean) {
        events.push(`worker.close(${String(force)})`);
        await new Promise((resolve) => setTimeout(resolve, 10));
        events.push(dbOpen ? "job.write" : "job.write_blocked");
      },
    };
    const database = async () => {
      dbOpen = false;
      events.push("database.close");
    };

    await closeWorkerRuntime({ workers: [worker, worker], resources: [database], force: false });

    expect(events).toEqual([
      "worker.close(false)", "worker.close(false)", "job.write", "job.write", "database.close",
    ]);
  });

  it("워커 하나가 닫히다 실패해도 연결은 닫는다", async () => {
    const closed: string[] = [];
    await closeWorkerRuntime({
      workers: [{ close: () => Promise.reject(new Error("redis gone")) }],
      resources: [async () => { closed.push("db"); }, () => Promise.reject(new Error("queue gone"))],
      force: true,
    });
    expect(closed).toEqual(["db"]);
  });
});
