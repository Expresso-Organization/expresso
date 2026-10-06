import { describe, expect, it } from "vitest";
import type { z } from "zod";

import { AiError, type AiCallSpec, type AiClient } from "../../platform/ai/client.js";
import { AiSearchInterpreter, NullSearchInterpreter, SEARCH_INTERPRET_PROMPT_VERSION } from "./search-interpreter.js";

class StubAiClient implements AiClient {
  calls: AiCallSpec[] = [];

  constructor(readonly responses: unknown[]) {}

  async complete<T>(spec: AiCallSpec, schema: z.ZodType<T>) {
    this.calls.push(spec);
    const response = this.responses.shift();
    if (response instanceof Error) throw response;
    return {
      data: schema.parse(response),
      usage: { model: "fixture", inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheCreationTokens: 0, costUsd: null, durationMs: 1 },
    };
  }
}

describe("search interpreters", () => {
  it("AI 비활성화 시 조건을 만들지 않는다", async () => {
    await expect(new NullSearchInterpreter().interpret()).resolves.toEqual([]);
  });

  it("근거가 있는 조건을 정규화하고 중복·미등록 값·지어낸 근거를 제외한다", async () => {
    const query = "서울 3년 TypeScript 백엔드 remote 연봉 6000 k8s UnknownTech";
    const client = new StubAiClient([{ conditions: [
      { field: "location", value: "서울", quote: "서울" },
      { field: "experience", value: 3, quote: "3년" },
      { field: "technology", value: "TypeScript", quote: "TypeScript" },
      { field: "technology", value: "typescript", quote: "TypeScript" },
      { field: "role", value: "백엔드", quote: "백엔드" },
      { field: "work_type", value: "remote", quote: "remote" },
      { field: "salary", value: 6000, quote: "연봉 6000" },
      { field: "technology", value: "k8s", quote: "k8s" },
      { field: "technology", value: "UnknownTech", quote: "UnknownTech" },
      { field: "technology", value: "python", quote: "Python" },
    ] }]);
    await expect(new AiSearchInterpreter(client).interpret(query)).resolves.toEqual([
      { field: "location", value: "서울", enabled: true, confidence: 0.85 },
      { field: "experience", value: 3, enabled: true, confidence: 0.9 },
      { field: "technology", value: "typescript", enabled: true, confidence: 0.95 },
      { field: "role", value: "백엔드", enabled: true, confidence: 0.9 },
      { field: "work_type", value: "remote", enabled: true, confidence: 0.9 },
      { field: "salary", value: 6000, enabled: false, confidence: 0.6 },
      { field: "technology", value: "kubernetes", enabled: true, confidence: 0.95 },
    ]);
    expect(client.calls).toHaveLength(1);
    expect(client.calls[0]).toMatchObject({ contract: "search_interpret", promptVersion: SEARCH_INTERPRET_PROMPT_VERSION });
    expect(client.calls[0]?.prompt).toContain(query);
  });

  it("잘못된 AI 응답은 한 번 재시도한다", async () => {
    const client = new StubAiClient([
      new AiError("AI_INVALID_OUTPUT", "search_interpret", "invalid"),
      { conditions: [{ field: "technology", value: "TypeScript", quote: "TypeScript" }] },
    ]);
    await expect(new AiSearchInterpreter(client).interpret("TypeScript")).resolves.toEqual([
      { field: "technology", value: "typescript", enabled: true, confidence: 0.95 },
    ]);
    expect(client.calls).toHaveLength(2);
  });

  it.each(["AI_TIMEOUT", "AI_RATE_LIMITED", "AI_UNAVAILABLE"] as const)("%s이면 빈 조건으로 반환한다", async (code) => {
    const client = new StubAiClient([new AiError(code, "search_interpret", "unavailable")]);
    await expect(new AiSearchInterpreter(client).interpret("TypeScript")).resolves.toEqual([]);
    expect(client.calls).toHaveLength(1);
  });

  it("두 번째 응답도 잘못되면 빈 조건으로 반환한다", async () => {
    const client = new StubAiClient(Array.from({ length: 2 }, () => new AiError("AI_INVALID_OUTPUT", "search_interpret", "invalid")));
    await expect(new AiSearchInterpreter(client).interpret("TypeScript")).resolves.toEqual([]);
    expect(client.calls).toHaveLength(2);
  });
});
