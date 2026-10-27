import type { z } from "zod";

import type { AiCallOptions, AiCallSpec, AiClient, AiResult } from "./client.js";
import { recordAiUsage, type AiUsageSink } from "./usage-sink.js";

/**
 * 모든 AI 호출의 사용량을 남긴다.
 *
 * 호출은 전부 `complete` 한 자리를 지나므로 모듈마다 기록하지 않고 여기서 감싼다.
 * 성공한 호출만 남긴다 — 화면 정의서가 "실패한 작업은 차감하지 않습니다"라고 정했다.
 */
export class MeteredAiClient implements AiClient {
  readonly #inner: AiClient;
  readonly #sink: AiUsageSink;

  constructor(inner: AiClient, sink: AiUsageSink) {
    this.#inner = inner;
    this.#sink = sink;
  }

  get streams(): boolean {
    return this.#inner.streams ?? false;
  }

  async complete<T>(
    spec: AiCallSpec,
    schema: z.ZodType<T>,
    options: AiCallOptions = {},
  ): Promise<AiResult<T>> {
    const result = await this.#inner.complete(spec, schema, options);
    recordAiUsage(this.#sink, { ...result.usage, userId: options.userId ?? null, contract: spec.contract });
    return result;
  }
}
