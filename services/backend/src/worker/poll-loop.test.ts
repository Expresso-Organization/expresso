import { MongoServerSelectionError } from "mongodb";
import { describe, expect, it } from "vitest";

import { MongoOutboxDispatcher } from "../platform/mongo-outbox.js";
import { createMongoResource } from "../platform/mongodb.js";
import { Wake } from "./outbox-wake.js";
import { runPollLoop } from "./poll-loop.js";

describe("runPollLoop", () => {
  it("첫 연결에 실패한 클라이언트에서 멈춘다 — 2026-11-04 운영 장애 재현", async () => {
    const database = createMongoResource("mongodb://127.0.0.1:1/expresso?directConnection=true", { databaseName: "expresso" });
    const dispatcher = new MongoOutboxDispatcher({ context: database, queue: { add: async () => undefined } });
    const errors: string[] = [];
    const fatal: string[] = [];
    let polls = 0;

    await runPollLoop({
      intervalMs: 1,
      signal: new AbortController().signal,
      poll: async () => {
        polls += 1;
        await dispatcher.pollOnce();
      },
      onError: (error) => errors.push((error as Error).name),
      onFatal: (error) => fatal.push((error as Error).name),
    });

    expect(polls).toBe(2);
    expect(errors).toEqual(["MongoServerSelectionError"]);
    expect(fatal).toEqual(["MongoTopologyClosedError"]);
    await database.close();
  }, 10_000);

  it("일시적 오류 뒤에는 계속 돌고 신호를 받으면 끝난다", async () => {
    const controller = new AbortController();
    const errors: unknown[] = [];
    const fatal: unknown[] = [];
    let polls = 0;

    await runPollLoop({
      intervalMs: 1,
      signal: controller.signal,
      poll: async () => {
        polls += 1;
        if (polls <= 3) throw new MongoServerSelectionError("no server", { type: "Unknown" } as never);
        controller.abort();
      },
      onError: (error) => errors.push(error),
      onFatal: (error) => fatal.push(error),
    });

    expect(polls).toBe(4);
    expect(errors).toHaveLength(3);
    expect(fatal).toEqual([]);
  });

  it("알림을 받으면 남은 대기를 건너뛰고, 폴링 중에 온 알림은 다음 대기를 건너뛴다", async () => {
    const controller = new AbortController();
    const wake = new Wake();
    const startedAt: number[] = [];
    const loop = runPollLoop({
      // 알림 없이는 테스트 시간 안에 두 번째 주기가 오지 않는다.
      intervalMs: 60_000,
      signal: controller.signal,
      wake,
      poll: async () => {
        startedAt.push(Date.now());
        // 첫 폴링 도중 들어온 알림 — 다음 대기를 건너뛰어 곧바로 두 번째 주기를 돈다.
        if (startedAt.length === 1) wake.notify();
        if (startedAt.length === 3) controller.abort();
      },
      onError: () => undefined,
      onFatal: () => undefined,
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(startedAt).toHaveLength(2);
    wake.notify();
    await loop;
    expect(startedAt).toHaveLength(3);
    expect(startedAt[2]! - startedAt[0]!).toBeLessThan(1_000);
  });

  it("알림 없이 신호가 끊기면 대기 중에도 바로 끝난다", async () => {
    const controller = new AbortController();
    let polls = 0;
    const loop = runPollLoop({
      intervalMs: 60_000, signal: controller.signal, wake: new Wake(),
      poll: async () => { polls += 1; }, onError: () => undefined, onFatal: () => undefined,
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    controller.abort();
    await loop;
    expect(polls).toBe(1);
  });
});
