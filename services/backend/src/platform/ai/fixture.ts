import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { z } from "zod";

import {
  AiError,
  callKey,
  type AiCallOptions,
  type AiCallSpec,
  type AiClient,
  type AiResult,
  type AiUsage,
} from "./client.js";

/**
 * 녹화된 응답을 재생하는 어댑터.
 *
 * 탐색이 회귀 테스트를 먹여살린다 — Claude Code로 돌려 본 호출이 그대로
 * 픽스처가 되고, CI는 그걸 재생한다. 네트워크도 쿼터도 쓰지 않고 결정적이다.
 *
 * 손으로 만든 **적대적 픽스처**도 여기 산다. 지어낸 수치, 원문에 없는 인용을
 * 담은 응답을 넣고 도메인 검증기가 막는지 보는 게 이 제품의 진짜 회귀 테스트다.
 */

export interface FixtureRecord {
  contract: string;
  promptVersion: number;
  model: string;
  /** 사람이 픽스처를 알아볼 수 있게 남긴다. 재생에는 쓰지 않는다. */
  system: string;
  prompt: string;
  data: unknown;
  usage: AiUsage;
  recordedAt: string;
}

function fixturePath(directory: string, spec: AiCallSpec, key: string): string {
  return join(directory, spec.contract, `${key}.json`);
}

export class FixtureAiClient implements AiClient {
  readonly #directory: string;

  constructor(directory: string) {
    this.#directory = directory;
  }

  /**
   * 녹화본을 조각내 흘려준다.
   *
   * 진짜 모델이 아니니 "빨라진" 것은 없다 — 값은 **경계에 있다.** 실제 델타는
   * 이스케이프 한가운데(`\\n`의 backslash와 n 사이)나 태그 중간에서 끊기고,
   * 받는 쪽이 그걸 견디는지는 그 경계를 재현해야만 드러난다. 지연은 넣지
   * 않는다 — 재현할 근거가 없는 숫자다.
   */
  readonly streams = true;

  async complete<T>(
    spec: AiCallSpec,
    schema: z.ZodType<T>,
    options: AiCallOptions = {},
  ): Promise<AiResult<T>> {
    const key = callKey(spec, schema);
    const path = fixturePath(this.#directory, spec, key);
    let raw: string;
    try {
      raw = await readFile(path, "utf8");
    } catch {
      throw new AiError(
        "AI_UNAVAILABLE",
        spec.contract,
        `녹화된 응답이 없습니다: ${path}\n`
        + "AI_PROVIDER=claude-code 또는 codex와 AI_RECORD=true로 한 번 돌려 녹화하세요.",
        { retryable: false },
      );
    }
    const record = JSON.parse(raw) as FixtureRecord;
    const validated = schema.safeParse(record.data);
    if (!validated.success) {
      // 픽스처가 스키마와 어긋났다 — 계약이 바뀌었는데 녹화가 낡은 것이다.
      throw new AiError(
        "AI_INVALID_OUTPUT",
        spec.contract,
        `녹화된 응답이 스키마와 맞지 않습니다(${path}): ${validated.error.message}`,
        { retryable: false },
      );
    }
    if (options.onPartial) {
      // 2026-08-14 실측: claude-code가 2,363자 응답을 69조각으로 냈다 — 조각당 34자.
      const CHUNK = 34;
      const encoded = JSON.stringify(record.data);
      for (let at = 0; at < encoded.length; at += CHUNK) {
        options.onPartial(encoded.slice(at, at + CHUNK));
      }
    }
    return { data: validated.data, usage: record.usage };
  }
}

/**
 * 어떤 클라이언트든 감싸서 호출을 픽스처로 남긴다.
 *
 * 실패한 호출은 남기지 않는다 — 재생할 가치가 있는 건 통과한 응답뿐이다.
 */
export class RecordingAiClient implements AiClient {
  readonly #inner: AiClient;
  readonly #directory: string;

  constructor(inner: AiClient, directory: string) {
    this.#inner = inner;
    this.#directory = directory;
  }

  get streams(): boolean {
    return this.#inner.streams ?? false;
  }

  async complete<T>(
    spec: AiCallSpec,
    schema: z.ZodType<T>,
    options: AiCallOptions = {},
  ): Promise<AiResult<T>> {
    // 감싼 쪽의 사정을 그대로 넘긴다 — 여기서 빠뜨리면 녹화 중에만 조각이 끊긴다.
    const result = await this.#inner.complete(spec, schema, options);
    const key = callKey(spec, schema);
    const path = fixturePath(this.#directory, spec, key);
    const record: FixtureRecord = {
      contract: spec.contract,
      promptVersion: spec.promptVersion,
      model: result.usage.model,
      system: spec.system,
      prompt: spec.prompt,
      data: result.data,
      usage: result.usage,
      recordedAt: new Date().toISOString(),
    };
    await mkdir(join(this.#directory, spec.contract), { recursive: true });
    await writeFile(path, `${JSON.stringify(record, null, 2)}\n`, "utf8");
    return result;
  }
}
