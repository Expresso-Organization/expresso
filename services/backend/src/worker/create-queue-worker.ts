import { Worker, type Job, type Processor, type Queue } from "bullmq";

import type { DeadLetterJob } from "../platform/queue.js";

export interface QueueWorkerOptions<TPayload, TResult> {
  queueName: string;
  redisUrl: string;
  processor: (job: Job<TPayload, TResult>) => Promise<TResult>;
  concurrency?: number;
  prefix?: string;
  deadLetterQueue?: Queue<DeadLetterJob>;
  onDeadLetterError?: (error: unknown) => void;
}

export function createQueueWorker<TPayload, TResult>(
  options: QueueWorkerOptions<TPayload, TResult>,
): Worker<TPayload, TResult> {
  const processor: Processor<TPayload, TResult> = async (job) =>
    options.processor(job);

  const worker = new Worker<TPayload, TResult>(options.queueName, processor, {
    connection: {
      url: options.redisUrl,
    },
    prefix: options.prefix ?? "expresso",
    concurrency: options.concurrency ?? 1,
  });

  worker.on("failed", (job, error) => {
    if (!job || !options.deadLetterQueue) return;
    const maxAttempts = job.opts.attempts ?? 1;
    if (job.attemptsMade < maxAttempts) return;

    const deadLetterId = `${job.id ?? "unknown"}-dead-letter`;
    void options.deadLetterQueue
      .add(
        "dead-letter",
        {
          originalQueue: options.queueName,
          originalJobId: job.id ?? null,
          originalName: job.name,
          attemptsMade: job.attemptsMade,
          failedReason: error.name,
          data: job.data,
        },
        { jobId: deadLetterId },
      )
      .catch((deadLetterError: unknown) => {
        options.onDeadLetterError?.(deadLetterError);
      });
  });

  return worker;
}
