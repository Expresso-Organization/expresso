import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import { createQueueWorker } from "../worker/create-queue-worker.js";
import { createReliableQueue } from "./queue.js";

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
});
