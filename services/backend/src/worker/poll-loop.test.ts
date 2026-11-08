import { MongoServerSelectionError } from "mongodb";
import { describe, expect, it } from "vitest";

import { MongoOutboxDispatcher } from "../platform/mongo-outbox.js";
import { createMongoResource } from "../platform/mongodb.js";
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
});
