import { MongoServerError, type Db } from "mongodb";
import { expect, it } from "vitest";

import { watchOutboxInserts } from "./outbox-wake.js";

/** 열 때마다 `error`로 끊기는 변경 흐름을 주는 DB. 몇 번 열었는지 센다. */
function failingDb(error: Error) {
  const opened = { count: 0 };
  const stream = () => ({
    async *[Symbol.asyncIterator]() { throw error; },
    async close() {},
  });
  const db = { collection: () => ({ watch: () => { opened.count += 1; return stream(); } }) } as unknown as Db;
  return { db, opened };
}

it("권한이 없으면 한 번 기록하고 다시 열지 않는다 — 1초마다 같은 오류를 남기지 않는다", async () => {
  const unauthorized = new MongoServerError({ message: "not authorized on expresso to execute command", code: 13, codeName: "Unauthorized" });
  const { db, opened } = failingDb(unauthorized);
  const errors: unknown[] = [];
  await watchOutboxInserts(db, () => undefined, { retryMs: 1, signal: new AbortController().signal, onError: (error) => errors.push(error) });
  expect(opened.count).toBe(1);
  expect(errors).toEqual([unauthorized]);
});

it("다른 오류는 기록하고 다시 연다 — Mongo 재시작 뒤 흐름을 되살린다", async () => {
  const controller = new AbortController();
  const { db, opened } = failingDb(new MongoServerError({ message: "interrupted", code: 11601, codeName: "Interrupted" }));
  const errors: unknown[] = [];
  await watchOutboxInserts(db, () => undefined, {
    retryMs: 1,
    signal: controller.signal,
    onError: (error) => { errors.push(error); if (errors.length === 3) controller.abort(); },
  });
  expect(opened.count).toBe(3);
});
