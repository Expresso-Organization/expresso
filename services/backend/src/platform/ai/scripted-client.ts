import type { z } from "zod";

import type { AiCallOptions, AiCallSpec, AiClient, AiContract, AiFix, AiResult, AiUsage } from "./client.js";
import { runWithFixes } from "./fixes.js";

/**
 * 테스트용 가짜 공급자입니다. 응답을 고르는 함수(`route`)와 고치기 응답을 고르는 함수(`fix`)로 돌고, 실제 어댑터와
 * 같은 검사 · 고치기 순서(`runWithFixes`)를 탑니다. 그래서 테스트가 "출력 거절 → 전체 다시 요청"이 아니라
 * "걸린 칸만 같은 대화에서 고쳐 받기"를 그대로 확인합니다.
 */
export class ScriptedAiClient implements AiClient {
  readonly calls: AiCallSpec[] = [];
  readonly fixRequests: { contract: AiContract; prompt: string; paths: string[] }[] = [];
  readonly streams = true;

  constructor(
    private readonly route: (request: AiCallSpec, attempt: number) => unknown,
    private readonly fix: (request: AiCallSpec, paths: string[], prompt: string) => AiFix[] = () => [],
    private readonly model: (request: AiCallSpec) => string = () => "test-model",
  ) {}

  async complete<T>(request: AiCallSpec, schema: z.ZodType<T>, options: AiCallOptions<T> = {}): Promise<AiResult<T>> {
    this.calls.push(request);
    const attempt = this.calls.filter((call) => call.contract === request.contract).length - 1;
    const usage: AiUsage = { model: this.model(request), inputTokens: 1, outputTokens: 100, cacheReadTokens: 0, cacheCreationTokens: 0, durationMs: 50, costUsd: 0.01 };
    return runWithFixes({
      contract: request.contract,
      schema,
      options,
      first: async () => {
        const output = this.route(request, attempt);
        // 부분 출력을 받는 호출에는 실제 공급자처럼 출력 JSON을 잘게 나눠 흘립니다.
        if (options.onPartial) {
          const text = JSON.stringify(output);
          for (let at = 0; at < text.length; at += 7) options.onPartial(text.slice(at, at + 7));
        }
        return { output, usage };
      },
      fix: async (prompt) => {
        const paths = [...prompt.matchAll(/^- (\S+): /gm)].map((match) => match[1]!);
        this.fixRequests.push({ contract: request.contract, prompt, paths });
        return { output: { fixes: this.fix(request, paths, prompt) }, usage: { ...usage, outputTokens: 10 } };
      },
    });
  }
}
