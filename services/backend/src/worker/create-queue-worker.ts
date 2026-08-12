import { Worker, type Job, type Processor, type Queue } from "bullmq";

import type { DeadLetterJob } from "../platform/queue.js";
import { safeErrorSummary } from "../platform/observability.js";

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
    // 실패는 **언제나 남긴다.** 예전에는 DLQ에 `error.name`만 넣고 지나갔고,
    // 그래서 잡이 다섯 번 죽어도 로그에 한 줄도 남지 않았다 — 지면 생성이
    // 그렇게 죽고 있었고 원인은 같은 잡을 직접 돌려 보고서야 찾았다.
    console.error(JSON.stringify({
      level: "error",
      event: "queue.job_failed",
      queue: options.queueName,
      jobName: job?.name ?? null,
      jobId: job?.id ?? null,
      attemptsMade: job?.attemptsMade ?? 0,
      maxAttempts: job?.opts.attempts ?? 1,
      error: safeErrorSummary(error),
      // 계약 호출이면 어댑터가 `ai.call_failed`에 사유를 따로 남긴다.
    }));

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
