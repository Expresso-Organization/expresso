import { describe, expect, it } from "vitest";

import { AiError, type AiFix } from "../../platform/ai/client.js";
import { ScriptedAiClient } from "../../platform/ai/scripted-client.js";
import {
  AiInsightWriter,
  InsightDraftError,
  insightViolations,
  type InsightContext,
  type InsightNote,
} from "./writer.js";

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

/** 첫 출력은 `reply`, 고치기 요청에는 `fix`가 답한다. 어댑터와 같은 검사 · 고치기 순서를 탄다. */
function scripted(reply: unknown, fix?: (paths: string[]) => AiFix[]) {
  return new ScriptedAiClient(() => {
    if (reply instanceof Error) throw reply;
    return reply;
  }, fix && ((_, paths) => fix(paths)));
}

describe("분석 해설 계약", () => {
  it("세 갈래 집계를 함께 준다", async () => {
    const ai = scripted(note);
    const written = await new AiInsightWriter(ai).write(context);

    const prompt = ai.calls[0]?.prompt ?? "";
    expect(ai.calls[0]?.contract).toBe("insight_note");
    expect(prompt).toContain("## 섹션별 체류");
    expect(prompt).toContain("장애 대응: 41회 · 평균 6초");
    expect(prompt).toContain("## 유입");
    expect(prompt).toContain("## 도메인");
    expect(written.suggestions[0]?.target).toBe("completes");
  });

  it("두 문장을 넘으면 해설 칸만 고쳐 받는다", async () => {
    const wordy = {
      ...note,
      narrative: "첫 문장입니다. 둘째 문장입니다. 셋째 문장입니다.",
    };
    expect(insightViolations(wordy, context)).toEqual([
      { path: "/narrative", problem: expect.stringContaining("해설은 두 문장 이내입니다") },
    ]);

    const ai = scripted(wordy, () => [{ path: "/narrative", value: note.narrative }]);
    const written = await new AiInsightWriter(ai).write(context);

    expect(ai.calls).toHaveLength(1);
    expect(ai.fixRequests.map(({ paths }) => paths)).toEqual([["/narrative"]]);
    expect(written.narrative).toBe(note.narrative);
  });

  it("고쳐도 두 문장을 넘으면 쓴 그대로 쓴다", async () => {
    const wordy = { ...note, narrative: "첫 문장입니다. 둘째 문장입니다. 셋째 문장입니다." };
    const ai = scripted(wordy);
    const written = await new AiInsightWriter(ai).write(context);

    expect(ai.calls).toHaveLength(1);
    // 걸린 칸이 줄지 않으면 한 번 고친 뒤 멈춘다(진전 기준, intent `ai-output-no-cli-rewrite`).
    expect(ai.fixRequests).toHaveLength(1);
    expect(written.narrative).toBe(wordy.narrative);
  });

  it("집계에 없는 지표는 그 자리만 고쳐 받는다", async () => {
    const stray = { ...note, evidenceMetrics: ["visits", "bounce_rate"] };
    expect(insightViolations(stray, context)).toEqual([
      { path: "/evidenceMetrics/1", problem: expect.stringContaining("집계에 없는 지표입니다: bounce_rate") },
    ]);

    const ai = scripted(stray, () => [{ path: "/evidenceMetrics/1", value: "completes" }]);
    const written = await new AiInsightWriter(ai).write(context);

    expect(ai.calls).toHaveLength(1);
    expect(written.evidenceMetrics).toEqual(["visits", "completes"]);
  });

  it("고쳐도 집계에 없는 지표가 남으면 해설을 만들 수 없다", async () => {
    const ai = scripted({ ...note, evidenceMetrics: ["bounce_rate"] });
    await expect(new AiInsightWriter(ai).write(context)).rejects.toThrow(/집계에 없는 지표/);
    expect(ai.calls).toHaveLength(1);
    // 걸린 칸이 줄지 않으면 한 번 고친 뒤 멈춘다(진전 기준, intent `ai-output-no-cli-rewrite`).
    expect(ai.fixRequests).toHaveLength(1);
  });

  it("제안이 없는 지표를 가리키면 그 target을 고쳐 받고, 남으면 만들 수 없다", async () => {
    const stray = {
      ...note,
      suggestions: [{ direction: "up" as const, target: "shares", action: "공유 버튼을 추가하세요." }],
    };
    expect(insightViolations(stray, context).map(({ path }) => path)).toEqual(["/suggestions/0/target"]);

    const ai = scripted(stray);
    await expect(new AiInsightWriter(ai).write(context)).rejects.toThrow(InsightDraftError);
    await expect(new AiInsightWriter(ai).write(context)).rejects.toThrow(/제안이 가리키는 지표/);
  });

  it("제안이 없으면 빈 배열이 정직한 답이다", async () => {
    const ai = scripted({ ...note, suggestions: [] });
    const written = await new AiInsightWriter(ai).write(context);
    expect(written.suggestions).toEqual([]);
  });

  it("레이트 리밋은 다시 물어보지 않는다", async () => {
    const limited = new AiError("AI_RATE_LIMITED", "insight_note", "usage limit", { retryable: false });
    const ai = scripted(limited);
    await expect(new AiInsightWriter(ai).write(context)).rejects.toThrow(AiError);
    expect(ai.calls).toHaveLength(1);
  });

  it("계약을 고쳐도 못 맞추면 공급자 오류로 끝나고 다시 요청하지 않는다", async () => {
    const ai = scripted({ ...note, evidenceMetrics: [] });
    await expect(new AiInsightWriter(ai).write(context)).rejects.toMatchObject({ code: "AI_INVALID_OUTPUT" });
    expect(ai.calls).toHaveLength(1);
  });
});
