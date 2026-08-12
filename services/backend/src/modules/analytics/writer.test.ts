import { describe, expect, it } from "vitest";
import type { z } from "zod";

import {
  AiError,
  type AiCallSpec,
  type AiClient,
  type AiResult,
} from "../../platform/ai/client.js";
import {
  AiInsightWriter,
  InsightDraftError,
  type InsightContext,
  type InsightNote,
} from "./writer.js";

const usage = {
  model: "claude-haiku-4-5-20251001",
  inputTokens: 800,
  outputTokens: 300,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
  costUsd: 0.002,
  durationMs: 3_000,
};

const context: InsightContext = {
  period: { start: "2026-07-01", end: "2026-07-31" },
  sampleSize: 48,
  metrics: {
    visits: 48,
    completes: 12,
    contact_clicks: 3,
    file_downloads: 1,
    eligible_section_views: 190,
    total_section_dwell_ms: 402_000,
  },
  sections: [
    { title: "소개", views: 48, dwellMs: 96_000 },
    { title: "장애 대응", views: 41, dwellMs: 226_000 },
    { title: "기술 스택", views: 14, dwellMs: 12_000 },
  ],
  referrers: [{ origin: "https://www.linkedin.com", visits: 27 }, { origin: "(직접 방문)", visits: 21 }],
  domains: [{ domain: "daangn.com", visits: 6 }],
};

const note: InsightNote = {
  narrative:
    "장애 대응 섹션에서 평균 5초를 넘게 머물렀지만 기술 스택까지 도달한 방문은 48건 중 14건입니다. 링크드인 유입 27건이 절반을 넘습니다.",
  evidenceMetrics: ["visits", "eligible_section_views", "completes"],
  suggestions: [{
    direction: "up",
    target: "completes",
    action: "기술 스택을 장애 대응 앞으로 옮겨 도달 전 이탈을 줄여 보세요.",
  }],
};

class StubAiClient implements AiClient {
  calls: AiCallSpec[] = [];
  constructor(private readonly replies: unknown[]) {}

  async complete<T>(spec: AiCallSpec, schema: z.ZodType<T>): Promise<AiResult<T>> {
    this.calls.push(spec);
    const reply = this.replies[this.calls.length - 1] ?? this.replies.at(-1);
    if (reply instanceof Error) throw reply;
    const parsed = schema.safeParse(reply);
    if (!parsed.success) {
      throw new AiError("AI_INVALID_OUTPUT", spec.contract, parsed.error.message, { retryable: true });
    }
    return { data: parsed.data, usage };
  }
}

describe("분석 해설 계약", () => {
  it("세 갈래 집계를 함께 준다", async () => {
    const ai = new StubAiClient([note]);
    const written = await new AiInsightWriter(ai).write(context);

    const prompt = ai.calls[0]?.prompt ?? "";
    expect(ai.calls[0]?.contract).toBe("insight_note");
    expect(prompt).toContain("## 섹션별 체류");
    expect(prompt).toContain("장애 대응: 41회 · 평균 6초");
    expect(prompt).toContain("## 유입");
    expect(prompt).toContain("## 도메인");
    expect(written.suggestions[0]?.target).toBe("completes");
  });

  it("두 문장을 넘으면 다시 쓰게 한다", async () => {
    const wordy = {
      ...note,
      narrative: "첫 문장입니다. 둘째 문장입니다. 셋째 문장입니다.",
    };
    const ai = new StubAiClient([wordy, note]);
    await new AiInsightWriter(ai).write(context);

    expect(ai.calls).toHaveLength(2);
    expect(ai.calls[1]?.prompt).toContain("해설은 두 문장 이내입니다");
  });

  it("집계에 없는 지표는 근거가 될 수 없다", async () => {
    const stray = { ...note, evidenceMetrics: ["bounce_rate"] };
    const ai = new StubAiClient([stray]);
    await expect(new AiInsightWriter(ai).write(context)).rejects.toThrow(/집계에 없는 지표/);
  });

  it("제안이 없는 지표를 가리키면 거절한다", async () => {
    const stray = {
      ...note,
      suggestions: [{ direction: "up" as const, target: "shares", action: "공유 버튼을 추가하세요." }],
    };
    const ai = new StubAiClient([stray]);
    await expect(new AiInsightWriter(ai).write(context)).rejects.toThrow(/제안이 가리키는 지표/);
  });

  it("제안이 없으면 빈 배열이 정직한 답이다", async () => {
    const ai = new StubAiClient([{ ...note, suggestions: [] }]);
    const written = await new AiInsightWriter(ai).write(context);
    expect(written.suggestions).toEqual([]);
  });

  it("레이트 리밋은 다시 물어보지 않는다", async () => {
    const limited = new AiError("AI_RATE_LIMITED", "insight_note", "usage limit", { retryable: false });
    const ai = new StubAiClient([limited]);
    await expect(new AiInsightWriter(ai).write(context)).rejects.toThrow(AiError);
    expect(ai.calls).toHaveLength(1);
  });

  it("두 번째도 계약을 벗어나면 포기한다", async () => {
    const ai = new StubAiClient([{ ...note, evidenceMetrics: ["없는지표"] }]);
    await expect(new AiInsightWriter(ai).write(context)).rejects.toThrow(InsightDraftError);
    expect(ai.calls).toHaveLength(2);
  });
});
