import { Queue, type JobsOptions } from "bullmq";

export interface DeadLetterJob {
  originalQueue: string;
  originalJobId: string | null;
  originalName: string;
  attemptsMade: number;
  failedReason: string;
  data: unknown;
}

export interface ReliableQueueResources<TPayload extends Record<string, unknown>> {
  queue: Queue<TPayload>;
  deadLetterQueue: Queue<DeadLetterJob>;
  defaultJobOptions: JobsOptions;
  close(): Promise<void>;
}

export function createReliableQueue<TPayload extends Record<string, unknown>>(
  queueName: string,
  redisUrl: string,
  prefix = "expresso",
): ReliableQueueResources<TPayload> {
  const connection = { url: redisUrl };
  const defaultJobOptions: JobsOptions = {
    attempts: 5,
    backoff: { type: "exponential", delay: 1_000 },
    removeOnComplete: { age: 86_400, count: 10_000 },
    removeOnFail: false,
  };
  const queue = new Queue<TPayload>(queueName, {
    connection,
    prefix,
    defaultJobOptions,
  });
  const deadLetterQueue = new Queue<DeadLetterJob>(`${queueName}-dead-letter`, {
    connection,
    prefix,
    defaultJobOptions: {
      removeOnComplete: false,
      removeOnFail: false,
    },
  });

  return {
    queue,
    deadLetterQueue,
    defaultJobOptions,
    async close() {
      await Promise.all([queue.close(), deadLetterQueue.close()]);
    },
  };
}
