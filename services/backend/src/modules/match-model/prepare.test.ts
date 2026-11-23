import { BSON, Timestamp } from "mongodb";
import { expect, it } from "vitest";
import { prepareMatchEmbeddings } from "./prepare.js";
import type { MatchModelService } from "./service.js";

it("변경 스트림보다 늦게 저장한 스냅샷은 체크포인트 경합 후 원천과 다시 대조한다", async () => {
  let checkpoint: string | null = null, generation = 0, backfills = 0;
  let source: string[] = ["deleted-record"], stored: string[] = [];
  const model = {
    context: { db: { command: async () => ({ operationTime: new Timestamp({ t: ++generation, i: 0 }) }) } },
    async embeddingCheckpoint(next?: string, expected?: string | null) {
      if (next !== undefined && checkpoint === expected) checkpoint = next;
      return checkpoint;
    },
    async backfillEmbeddings() {
      const snapshot = [...source];
      if (++backfills === 1) {
        // Worker가 삭제를 처리했지만 오래된 전체 준비 요청이 뒤늦게 기록을 되살린 상황입니다.
        source = [];
        stored = [];
        checkpoint = "worker-advanced";
      }
      stored = snapshot;
    },
  } as unknown as MatchModelService;
  const result = await prepareMatchEmbeddings(model, new AbortController().signal);
  expect(stored).toEqual([]);
  expect(result.reconciliations).toBe(1);
  expect(BSON.EJSON.parse(result.token).startAtOperationTime.getHighBitsUnsigned()).toBe(2);
});

it("준비 도중의 변경도 재처리하도록 준비 시작 시점을 체크포인트로 보존한다", async () => {
  let time = 1;
  const model = {
    context: { db: { command: async () => ({ operationTime: new Timestamp({ t: time, i: 0 }) }) } },
    async embeddingCheckpoint(next?: string) { return next ?? null; },
    async backfillEmbeddings() { time = 2; },
  } as unknown as MatchModelService;
  const result = await prepareMatchEmbeddings(model, new AbortController().signal);
  const resumeTime = BSON.EJSON.parse(result.token).startAtOperationTime.getHighBitsUnsigned();
  expect(resumeTime).toBeLessThan(time);
});
