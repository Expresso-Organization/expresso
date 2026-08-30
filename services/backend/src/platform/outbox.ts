import type { JobsOptions } from "bullmq";

/** MongoDB outbox와 BullMQ 어댑터가 공유하는 저장소 중립 계약입니다. */
export interface OutboxEventInput {
  topic: string;
  payload: Record<string, unknown>;
  idempotencyKey: string;
}

export interface OutboxEvent {
  id: string;
  topic: string;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  state: "pending" | "publishing" | "published" | "dead_letter";
  attempts: number;
}

export interface QueuePublisher {
  add(
    name: string,
    payload: Record<string, unknown>,
    options: JobsOptions,
  ): Promise<unknown>;
}
