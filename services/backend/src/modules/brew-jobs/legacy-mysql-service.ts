import { type BrewJobRunner, BrewJobError, type FailureClassifier } from "./public.js";
export { type BrewJobRunner, BrewJobError, type FailureClassifier } from "./public.js";
import {
  BrewJobStatusSchema,
  type BrewJobType,
} from "@expresso/contracts";
import type { SqlTag } from "../../platform/legacy-mysql.js";

import { addOutboxEvent } from "../../platform/legacy-mysql-outbox.js";

/**
 * 제작 단계 잡 — 질문 생성 · 레시피 생성.
 *
 * `generation_job`이 이미 증명한 모양이다. 잡 행을 먼저 만들고, 계약이 끝나면
 * 결과를 가리킨다. 도메인 행은 **완성된 상태로만** 태어난다 — 질문 3개 미만인
 * 세션이나 섹션 없는 레시피는 계약상 존재할 수 없기 때문이다.
 */

interface JobRow {
  id: string;
  user_id: string;
  type: BrewJobType;
  status: "queued" | "running" | "succeeded" | "failed";
  stage: string;
  attempts: number;
  input: { brewId?: string };
  result_id: string | null;
  error_code: string | null;
  failure_retryable: boolean | null;
}

const TOPIC: Record<BrewJobType, string> = {
  interview: "interview.draft",
  recipe: "recipe.draft",
};

export class BrewJobService {
  readonly #sql: SqlTag;

  constructor(sql: SqlTag) {
    this.#sql = sql;
  }

  async submit(
    userId: string,
    type: BrewJobType,
    idempotencyKey: string,
    input: { brewId: string },
  ) {
    const jobId = await this.#sql.begin(async (transaction) => {
      const owned = (await transaction<{ id: string }[]>`
        select id from brew where id = ${input.brewId} and user_id = ${userId}
      `)[0];
      if (!owned) throw new BrewJobError(404, "brew not found");

      const inserted = (await transaction<{ id: string; input: { brewId?: string } }[]>`
        insert ignore into brew_job (user_id, type, input, input_idempotency_key)
        values (${userId}, ${type}, ${transaction.json(input)}, ${idempotencyKey})
        returning id, input
      `)[0] ?? (await transaction<{ id: string; input: { brewId?: string } }[]>`
        select id, input from brew_job
        where user_id = ${userId} and input_idempotency_key = ${idempotencyKey}
      `)[0];
      if (!inserted) throw new Error("brew job missing");
      // 같은 키를 다른 대상에 재사용하면 결과가 뒤바뀐다. 그건 실수다.
      if (inserted.input.brewId !== input.brewId) {
        throw new BrewJobError(409, "idempotency key reused for another brew");
      }

      await addOutboxEvent(transaction, {
        topic: TOPIC[type],
        payload: { brewJobId: inserted.id, userId },
        idempotencyKey: `brew-job:${inserted.id}`,
      });
      return inserted.id;
    });
    return this.getStatus(userId, jobId);
  }

  async getStatus(userId: string, jobId: string) {
    const job = (await this.#sql<JobRow[]>`
      select * from brew_job where id = ${jobId} and user_id = ${userId}
    `)[0];
    if (!job) throw new BrewJobError(404, "brew job not found");
    return BrewJobStatusSchema.parse({
      jobId: job.id,
      type: job.type,
      status: job.status,
      stage: job.stage,
      attempts: job.attempts,
      resultId: job.result_id,
      failure: job.error_code
        ? { code: job.error_code, retryable: job.failure_retryable ?? false }
        : null,
    });
  }

  /**
   * 잡을 돌린다.
   *
   * 계약 호출은 트랜잭션 밖이다 — 1분 넘게 걸리는 일이라 안에서 부르면 그동안
   * 커넥션을 붙들고 있게 된다. 이미 끝난 잡은 다시 돌리지 않는다.
   */
  async process(jobId: string, runner: BrewJobRunner, classify: FailureClassifier) {
    const job = await this.#sql.begin(async (transaction) => {
      const locked = (await transaction<JobRow[]>`
        select * from brew_job where id = ${jobId} for update
      `)[0];
      if (!locked) throw new BrewJobError(404, "brew job not found");
      if (locked.status === "succeeded") return locked;
      await transaction`
        update brew_job set status = 'running', stage = 'drafting',
          attempts = attempts + 1, error_code = null, failure_retryable = null,
          updated_at = now(6)
        where id = ${jobId}
      `;
      return { ...locked, attempts: locked.attempts + 1 };
    });
    if (job.status === "succeeded") return this.getStatus(job.user_id, job.id);

    const brewId = job.input.brewId;
    if (!brewId) throw new Error("brew job input is missing brewId");

    try {
      const resultId = await runner.run({
        userId: job.user_id,
        brewId,
        // 잡 하나에 결과 하나. 재시도해도 같은 것을 가리킨다.
        idempotencyKey: `brew-job:${job.id}`,
      });
      await this.#sql`
        update brew_job set status = 'succeeded', stage = 'done',
          result_id = ${resultId}, updated_at = now(6)
        where id = ${jobId}
      `;
    } catch (error) {
      const { code, retryable } = classify(error);
      await this.#sql`
        update brew_job set status = 'failed', stage = 'failed',
          error_code = ${code}, failure_retryable = ${retryable}, updated_at = now(6)
        where id = ${jobId}
      `.catch(() => undefined);
      throw error;
    }
    return this.getStatus(job.user_id, job.id);
  }
}
