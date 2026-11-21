import {
  MongoNetworkError,
  MongoNotConnectedError,
  MongoServerError,
  MongoServerSelectionError,
  MongoTopologyClosedError,
} from "mongodb";
import { describe, expect, it } from "vitest";

import { connectMongoUntilReady, createMongoResource, isMongoClientClosedError, isMongoUnavailableError } from "./mongodb.js";

const selectionError = () => new MongoServerSelectionError("no server", { type: "Unknown" } as never);

describe("Mongo 오류 판별", () => {
  it("닫힌 클라이언트 오류만 복구 불가로 본다", () => {
    expect(isMongoClientClosedError(new MongoTopologyClosedError())).toBe(true);
    expect(isMongoClientClosedError(new MongoNotConnectedError("closed"))).toBe(true);
    expect(isMongoClientClosedError(selectionError())).toBe(false);
    expect(isMongoClientClosedError(new MongoNetworkError("reset"))).toBe(false);
    expect(isMongoClientClosedError(new Error("other"))).toBe(false);
    expect(isMongoClientClosedError("not an error")).toBe(false);
  });

  it("서버의 거절은 도달 불가로 보지 않는다", () => {
    expect(isMongoUnavailableError(new MongoTopologyClosedError())).toBe(true);
    expect(isMongoUnavailableError(selectionError())).toBe(true);
    expect(isMongoUnavailableError(new MongoNetworkError("reset"))).toBe(true);
    expect(isMongoUnavailableError(new MongoServerError({ message: "auth failed", code: 18 }))).toBe(false);
    expect(isMongoUnavailableError(new Error("other"))).toBe(false);
  });

  it("다른 오류에 감싸인 원인도 찾는다", () => {
    const wrapped = new Error("outer", { cause: new Error("middle", { cause: new MongoTopologyClosedError() }) });
    expect(isMongoClientClosedError(wrapped)).toBe(true);
    expect(isMongoUnavailableError(wrapped)).toBe(true);
    const circular = new Error("loop");
    circular.cause = circular;
    expect(isMongoClientClosedError(circular)).toBe(false);
  });

  it("실제 드라이버는 첫 연결 실패 뒤 닫힌 topology를 계속 돌려준다", async () => {
    const database = createMongoResource("mongodb://127.0.0.1:1/expresso?directConnection=true", { databaseName: "expresso" });
    const first = await database.db.command({ ping: 1 }).catch((error: unknown) => error);
    const second = await database.db.command({ ping: 1 }).catch((error: unknown) => error);
    expect(isMongoUnavailableError(first)).toBe(true);
    expect(isMongoClientClosedError(first)).toBe(false);
    expect(isMongoClientClosedError(second)).toBe(true);
    await database.close();
  }, 10_000);
});

describe("connectMongoUntilReady", () => {
  it("연결되면 끝난다", async () => {
    let calls = 0;
    const retries: unknown[] = [];
    await connectMongoUntilReady(
      { connect: (async () => { calls += 1; }) as never },
      { signal: new AbortController().signal, onRetry: (error) => retries.push(error) },
    );
    expect(calls).toBe(1);
    expect(retries).toEqual([]);
  });

  it("실패하면 다시 시도하고 중단하면 거부 없이 끝난다", async () => {
    const database = createMongoResource("mongodb://127.0.0.1:1/expresso?directConnection=true", { databaseName: "expresso" });
    const controller = new AbortController();
    const retries: string[] = [];
    const finished = connectMongoUntilReady(database.client, {
      signal: controller.signal,
      onRetry(error) {
        retries.push((error as Error).name);
        if (retries.length === 2) controller.abort();
      },
    });
    await expect(finished).resolves.toBeUndefined();
    expect(retries).toEqual(["MongoServerSelectionError", "MongoServerSelectionError"]);
    await database.close();
  }, 15_000);

  it("중단 뒤에는 connect를 부르지 않는다", async () => {
    const controller = new AbortController();
    controller.abort();
    let calls = 0;
    await connectMongoUntilReady(
      { connect: (async () => { calls += 1; }) as never },
      { signal: controller.signal, onRetry: () => undefined },
    );
    expect(calls).toBe(0);
  });
});
