import { randomUUID } from "node:crypto";

import { mongoCollections } from "@expresso/database";

import type { MongoContext } from "../mongodb.js";
import type { AiUsage } from "./client.js";

/**
 * AI 호출 한 건의 사용량과 그 주인.
 *
 * `contract`가 `AiContract`보다 넓은 이유는 에이전트 채팅(`agent_chat`)이 `AiClient`를
 * 지나지 않고 같은 자리에 쌓이기 때문이다.
 */
export interface AiUsageEvent extends AiUsage {
  userId: string | null;
  contract: string;
}

export interface AiUsageSink {
  record(event: AiUsageEvent): Promise<void>;
}

export class MongoAiUsageSink implements AiUsageSink {
  constructor(private readonly context: MongoContext) {}

  async record(event: AiUsageEvent): Promise<void> {
    await mongoCollections(this.context.db).aiUsageEvents.insertOne({
      _id: randomUUID(),
      userId: event.userId,
      contract: event.contract,
      model: event.model,
      inputTokens: event.inputTokens,
      outputTokens: event.outputTokens,
      cacheReadTokens: event.cacheReadTokens,
      cacheCreationTokens: event.cacheCreationTokens,
      costUsd: event.costUsd,
      durationMs: event.durationMs,
      createdAt: new Date(),
    });
  }
}

/**
 * 기다리지 않고 남긴다.
 *
 * 기록이 실패해도 호출 결과는 그대로 돌아가야 한다 — 계측이 기능을 막지 않는다.
 * 실패는 로그 한 줄로만 남는다.
 */
export function recordAiUsage(sink: AiUsageSink, event: AiUsageEvent): void {
  const fail = (error: unknown) => {
    console.error(JSON.stringify({
      level: "error",
      event: "ai.usage_record_failed",
      contract: event.contract,
      model: event.model,
      detail: error instanceof Error ? error.message : String(error),
    }));
  };
  try {
    void sink.record(event).catch(fail);
  } catch (error) {
    fail(error);
  }
}
