import type { JobsOptions } from "bullmq";
import type { SqlTag, JSONValue } from "./mysql.js";

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

interface OutboxRow {
  id: string;
  topic: string;
  payload: Record<string, unknown>;
  idempotency_key: string;
  state: OutboxEvent["state"];
  attempts: number;
}

export interface QueuePublisher {
  add(
    name: string,
    payload: Record<string, unknown>,
    options: JobsOptions,
  ): Promise<unknown>;
}

export interface OutboxDispatcherOptions {
  sql: SqlTag;
  queue: QueuePublisher;
  batchSize?: number;
  maxAttempts?: number;
  lockTimeoutSeconds?: number;
}

function toEvent(row: OutboxRow): OutboxEvent {
  return {
    id: row.id,
    topic: row.topic,
    payload: row.payload,
    idempotencyKey: row.idempotency_key,
    state: row.state,
    attempts: row.attempts,
  };
}

function sanitizedError(error: unknown): string {
  if (!(error instanceof Error)) return "UnknownError";
  const code = (error as Error & { code?: unknown }).code;
  return typeof code === "string" && /^[A-Za-z0-9_]{1,64}$/.test(code)
    ? `${error.name}:${code}`
    : error.name;
}

export async function addOutboxEvent(
  sql: SqlTag | SqlTag,
  input: OutboxEventInput,
): Promise<OutboxEvent> {
  // 같은 멱등 키가 이미 있으면 새 줄이 생기지 않는다 — 넣고 나서 그 키로 읽는다.
  await sql`
    insert ignore into platform_outbox (topic, payload, idempotency_key)
    values (
      ${input.topic},
      ${sql.json(input.payload as JSONValue)},
      ${input.idempotencyKey}
    )
  `;
  const rows = await sql<OutboxRow[]>`
    select id, topic, payload, idempotency_key, state, attempts
    from platform_outbox
    where idempotency_key = ${input.idempotencyKey}
    limit 1
  `;
  const row = rows[0];
  if (!row) throw new Error("outbox event was not persisted");
  return toEvent(row);
}

export class OutboxDispatcher {
  readonly #sql: SqlTag;
  readonly #queue: QueuePublisher;
  readonly #batchSize: number;
  readonly #maxAttempts: number;
  readonly #lockTimeoutSeconds: number;

  constructor(options: OutboxDispatcherOptions) {
    this.#sql = options.sql;
    this.#queue = options.queue;
    this.#batchSize = options.batchSize ?? 25;
    this.#maxAttempts = options.maxAttempts ?? 5;
    this.#lockTimeoutSeconds = options.lockTimeoutSeconds ?? 60;
  }

  async pollOnce(): Promise<{ published: number; retried: number; deadLettered: number }> {
    const claimed = await this.#claim();
    let published = 0;
    let retried = 0;
    let deadLettered = 0;

    for (const event of claimed) {
      try {
        await this.#queue.add(event.topic, event.payload, {
          jobId: event.id,
          attempts: this.#maxAttempts,
          backoff: { type: "exponential", delay: 1_000 },
          removeOnComplete: { age: 86_400, count: 10_000 },
          removeOnFail: false,
        });
        await this.#sql`
          update platform_outbox
          set state = 'published',
              locked_at = null,
              published_at = now(6),
              last_error = null,
              updated_at = now(6)
          where id = ${event.id}
            and state = 'publishing'
        `;
        published += 1;
      } catch (error) {
        const outcome = await this.#recordFailure(event, error);
        if (outcome === "dead_letter") deadLettered += 1;
        else retried += 1;
      }
    }

    return { published, retried, deadLettered };
  }

  async #claim(): Promise<OutboxEvent[]> {
    // 집어 갈 것을 잠가서 고르고, 같은 트랜잭션 안에서 상태를 옮긴 뒤 다시 읽는다.
    const rows = await this.#sql.begin(async (transaction) => {
      const candidates = await transaction<{ id: string }[]>`
        select id
        from platform_outbox
        where (
            state = 'pending'
            or (
              state = 'publishing'
              and locked_at < now(6) - interval ${this.#lockTimeoutSeconds} second
            )
          )
          and available_at <= now(6)
        order by available_at, created_at
        limit ${this.#batchSize}
        for update skip locked
      `;
      if (candidates.length === 0) return [] as OutboxRow[];
      const ids = candidates.map(({ id }) => id);
      await transaction`
        update platform_outbox
        set state = 'publishing', locked_at = now(6), updated_at = now(6)
        where id in ${transaction(ids)}
      `;
      return transaction<OutboxRow[]>`
        select id, topic, payload, idempotency_key, state, attempts
        from platform_outbox where id in ${transaction(ids)}
      `;
    });
    return rows.map(toEvent);
  }

  async #recordFailure(
    event: OutboxEvent,
    error: unknown,
  ): Promise<"retry" | "dead_letter"> {
    const nextAttempts = event.attempts + 1;
    const deadLettered = nextAttempts >= this.#maxAttempts;
    const retryDelaySeconds = Math.min(2 ** nextAttempts, 300);

    await this.#sql`
      update platform_outbox
      set state = ${deadLettered ? "dead_letter" : "pending"},
          attempts = ${nextAttempts},
          available_at = case
            when ${deadLettered} then available_at
            else now(6) + make_interval(secs => ${retryDelaySeconds})
          end,
          locked_at = null,
          last_error = ${sanitizedError(error)},
          updated_at = now(6)
      where id = ${event.id}
        and state = 'publishing'
    `;

    return deadLettered ? "dead_letter" : "retry";
  }
}
