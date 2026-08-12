import { describe, expect, it } from "vitest";
import { z } from "zod";

import type { AiCallSpec } from "./client.js";
import { CodexAiClient } from "./codex.js";

/**
 * 로그인된 Codex CLI와 실제 이음매를 확인한다. 쿼터를 쓰므로 기본 테스트에서는
 * 건너뛰고 `CODEX_LIVE_TEST=1`일 때만 실행한다.
 */
const describeLive = process.env.CODEX_LIVE_TEST === "1" ? describe : describe.skip;

const ExtractionSchema = z.strictObject({
  technologies: z.array(z.string().min(1)),
  summary: z.string().min(1).max(200),
});

const spec: AiCallSpec = {
  contract: "job_analysis",
  system: "공고에 적히지 않은 정보는 만들지 않는 구조화 추출기다.",
  prompt: "Airflow와 Spark를 쓰는 데이터 엔지니어 공고에서 기술 스택을 추출해라.",
  promptVersion: 1,
  modelTier: "haiku",
};

describeLive("Codex CLI 실제 호출", () => {
  it("스키마를 강제하고 사용량을 반환한다", async () => {
    const result = await new CodexAiClient({ timeoutMs: 120_000 })
      .complete(spec, ExtractionSchema);

    expect(result.data.technologies.some((name) => name.includes("Airflow"))).toBe(true);
    expect(result.data.technologies.some((name) => name.includes("Spark"))).toBe(true);
    expect(result.usage.model).toBe("gpt-5.6-luna");
    expect(result.usage.outputTokens).toBeGreaterThan(0);
  }, 180_000);
});
