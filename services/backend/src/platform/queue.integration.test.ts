import { randomUUID } from "node:crypto";

import { MongoServerSelectionError, MongoTopologyClosedError } from "mongodb";
import { UnrecoverableError } from "bullmq";
import { afterEach, describe, expect, it } from "vitest";

import { createQueueWorker } from "../worker/create-queue-worker.js";
import { createReliableQueue } from "./queue.js";
import { AiError } from "./ai/client.js";

const redisUrl = process.env.TEST_REDIS_URL;
const describeWithRedis = redisUrl ? describe : describe.skip;

async function waitFor<T>(
  read: () => Promise<T | undefined>,
  timeoutMs = 5_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await read();
    if (result !== undefined) return result;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("timed out waiting for queue state");
}

describeWithRedis("reliable queue integration", () => {
  const cleanups: (() => Promise<void>)[] = [];

  afterEach(async () => {
    await Promise.allSettled(cleanups.splice(0).map((cleanup) => cleanup()));
  });

  it.each([
    ["닫힌 클라이언트", () => new MongoTopologyClosedError(), 1],
    ["서버 선택 실패", () => new MongoServerSelectionError("no server", { type: "Unknown" } as never), 0],
  ] as const)("Mongo 도달 불가(%s)는 시도 횟수를 쓰지 않고 미룬다", async (_label, makeError, expectedFatal) => {
    const prefix = `expresso-test-${randomUUID()}`;
    const resources = createReliableQueue<{ value: number }>("mongo-down-job", redisUrl!, prefix);
    const fatal: unknown[] = [];
    let attempts = 0;
    const worker = createQueueWorker<{ value: number }, { done: true }>({
      queueName: "mongo-down-job",
      redisUrl: redisUrl!,
      prefix,
      deadLetterQueue: resources.deadLetterQueue,
      onFatalError: (error) => fatal.push(error),
      async processor() {
        attempts += 1;
        if (attempts === 1) throw makeError();
        return { done: true };
      },
    });
    cleanups.push(async () => {
      await worker.close();
      await Promise.all([resources.queue.obliterate({ force: true }), resources.deadLetterQueue.obliterate({ force: true })]);
      await resources.close();
    });

    const job = await resources.queue.add("work", { value: 1 });
    // 상태를 먼저 보고 잡을 나중에 읽는다. BullMQ는 상태 이동과 잡 해시 갱신(`atm` · `delay`)을 한 스크립트로
    // 처리하므로, 상태가 보인 뒤 읽은 해시는 그 상태의 값이다. 순서를 거꾸로 하면 두 읽기 사이에 워커가
    // 잡을 끝내, 끝나기 전 값(`attemptsMade: 0`)을 들고 완료로 판정할 수 있다(#189).
    await waitFor(async () => ((await resources.queue.getJobState(job.id!)) === "delayed" ? true : undefined));
    const deferred = await resources.queue.getJob(job.id!);
    expect(deferred?.attemptsMade).toBe(0);
    expect(fatal).toHaveLength(expectedFatal);

    // Mongo가 돌아오면 그대로 끝난다. 시도 횟수는 성공한 한 번만 쓴다.
    await waitFor(async () => ((await resources.queue.getJobState(job.id!)) === "completed" ? true : undefined), 10_000);
    const finished = await resources.queue.getJob(job.id!);
    expect(finished?.attemptsMade).toBe(1);
    expect(await resources.deadLetterQueue.count()).toBe(0);
  }, 20_000);

  it("멈추는 중에 끊긴 잡은 시도 횟수를 쓰지 않고 다음 Worker가 끝낸다", async () => {
    const prefix = `expresso-test-${randomUUID()}`;
    const resources = createReliableQueue<{ value: number }>("stopping-job", redisUrl!, prefix);
    const stopping = new AbortController();
    // 배포 재시작: 신호가 오면 main.ts가 곧바로 워커를 닫고, 같은 신호를 받은 claude CLI가 끊긴다.
    const first = createQueueWorker<{ value: number }, { done: true }>({
      queueName: "stopping-job",
      redisUrl: redisUrl!,
      prefix,
      deadLetterQueue: resources.deadLetterQueue,
      stopping: stopping.signal,
      async processor() {
        stopping.abort();
        void first.close();
        throw new AiError("AI_UNAVAILABLE", "question_draft", "claude was terminated by SIGTERM", { retryable: true });
      },
    });
    cleanups.push(async () => {
      await first.close();
      await Promise.all([resources.queue.obliterate({ force: true }), resources.deadLetterQueue.obliterate({ force: true })]);
      await resources.close();
    });

    const job = await resources.queue.add("work", { value: 1 }, { attempts: 5 });
    await first.close();
    const state = await resources.queue.getJobState(job.id!);
    expect(["delayed", "waiting"]).toContain(state);
    expect((await resources.queue.getJob(job.id!))?.attemptsMade).toBe(0);

    const next = createQueueWorker<{ value: number }, { done: true }>({
      queueName: "stopping-job",
      redisUrl: redisUrl!,
      prefix,
      deadLetterQueue: resources.deadLetterQueue,
      async processor() { return { done: true }; },
    });
    cleanups.unshift(() => next.close());
    await waitFor(async () => ((await resources.queue.getJobState(job.id!)) === "completed" ? true : undefined), 10_000);
    expect((await resources.queue.getJob(job.id!))?.attemptsMade).toBe(1);
    expect(await resources.deadLetterQueue.count()).toBe(0);
  }, 20_000);

  it("멈추는 중이라도 다시 돌려도 같은 답인 거절은 실패로 끝낸다", async () => {
    const prefix = `expresso-test-${randomUUID()}`;
    const resources = createReliableQueue<{ value: number }>("stopping-reject", redisUrl!, prefix);
    const stopping = new AbortController();
    stopping.abort();
    const worker = createQueueWorker<{ value: number }, never>({
      queueName: "stopping-reject",
      redisUrl: redisUrl!,
      prefix,
      deadLetterQueue: resources.deadLetterQueue,
      stopping: stopping.signal,
      async processor() { throw new UnrecoverableError("BREW_INPUT_REJECTED"); },
    });
    cleanups.push(async () => {
      await worker.close();
      await Promise.all([resources.queue.obliterate({ force: true }), resources.deadLetterQueue.obliterate({ force: true })]);
      await resources.close();
    });

    const job = await resources.queue.add("work", { value: 1 }, { attempts: 5 });
    await waitFor(async () => ((await resources.queue.getJobState(job.id!)) === "failed" ? true : undefined));
  }, 20_000);

  it("동시 수만큼 잡을 겹쳐 돌린다", async () => {
    const prefix = `expresso-test-${randomUUID()}`;
    const resources = createReliableQueue<{ value: number }>("parallel-job", redisUrl!, prefix);
    let running = 0;
    let peak = 0;
    const worker = createQueueWorker<{ value: number }, number>({
      queueName: "parallel-job",
      redisUrl: redisUrl!,
      prefix,
      concurrency: 3,
      async processor(job) {
        running += 1;
        peak = Math.max(peak, running);
        await new Promise((resolve) => setTimeout(resolve, 300));
        running -= 1;
        return job.data.value;
      },
    });
    cleanups.push(async () => {
      await worker.close();
      await resources.queue.obliterate({ force: true });
      await resources.close();
    });
    let finished = 0;
    worker.on("completed", () => { finished += 1; });
    await Promise.all([1, 2, 3].map((value) => resources.queue.add("work", { value }, { jobId: randomUUID() })));
    const startedAt = Date.now();
    while (finished < 3 && Date.now() - startedAt < 10_000) await new Promise((resolve) => setTimeout(resolve, 25));
    expect(finished).toBe(3);
    expect(peak).toBe(3);
  });

  it("retries a failing job and copies the terminal failure to a DLQ", async () => {
    const prefix = `expresso-test-${randomUUID()}`;
    const resources = createReliableQueue<{ value: number }>(
      "reliable-job",
      redisUrl!,
      prefix,
    );
    let attempts = 0;
    let deadLetterError: unknown;
    const worker = createQueueWorker<{ value: number }, never>({
      queueName: "reliable-job",
      redisUrl: redisUrl!,
      prefix,
      concurrency: 1,
      deadLetterQueue: resources.deadLetterQueue,
      onDeadLetterError(error) {
        deadLetterError = error;
      },
      async processor() {
        attempts += 1;
        throw new Error("provider secret must not enter DLQ metadata");
      },
    });
    cleanups.push(async () => {
      await worker.close();
      await Promise.all([
        resources.queue.obliterate({ force: true }),
        resources.deadLetterQueue.obliterate({ force: true }),
      ]);
      await resources.close();
    });

    const job = await resources.queue.add(
      "always-fails",
      { value: 1 },
      {
        jobId: randomUUID(),
        attempts: 2,
        backoff: { type: "fixed", delay: 25 },
      },
    );
    const deadLetter = await waitFor(async () => {
      const candidate = await resources.deadLetterQueue.getJob(
        `${job.id}-dead-letter`,
      );
      return candidate ?? undefined;
    });

    expect(attempts).toBe(2);
    expect(deadLetter.data).toMatchObject({
      originalQueue: "reliable-job",
      originalJobId: job.id,
      originalName: "always-fails",
      attemptsMade: 2,
      failedReason: "Error",
    });
    expect(JSON.stringify(deadLetter.data)).not.toContain("provider secret");
    expect(deadLetterError).toBeUndefined();
  });

  it("계약을 못 맞춘 AI 출력 실패는 다시 돌리지 않고 바로 DLQ로 보낸다", async () => {
    const prefix = `expresso-test-${randomUUID()}`;
    const resources = createReliableQueue<{ value: number }>("reliable-job", redisUrl!, prefix);
    let attempts = 0;
    const worker = createQueueWorker<{ value: number }, never>({
      queueName: "reliable-job",
      redisUrl: redisUrl!,
      prefix,
      concurrency: 1,
      deadLetterQueue: resources.deadLetterQueue,
      async processor() {
        attempts += 1;
        throw new AiError("AI_INVALID_OUTPUT", "recipe_draft", "고쳐도 계약을 못 맞춤");
      },
    });
    cleanups.push(async () => {
      await worker.close();
      await Promise.all([resources.queue.obliterate({ force: true }), resources.deadLetterQueue.obliterate({ force: true })]);
      await resources.close();
    });
    const job = await resources.queue.add("contract-fails", { value: 1 }, { jobId: randomUUID(), attempts: 5, backoff: { type: "fixed", delay: 25 } });
    const deadLetter = await waitFor(async () => (await resources.deadLetterQueue.getJob(`${job.id}-dead-letter`)) ?? undefined);
    expect(attempts).toBe(1);
    expect(deadLetter.data).toMatchObject({ originalName: "contract-fails", attemptsMade: 1, failedReason: "UnrecoverableError" });
  });
});
