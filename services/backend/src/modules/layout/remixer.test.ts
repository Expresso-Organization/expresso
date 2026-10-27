import type { LayoutDraft, LayoutSpec } from "@expresso/contracts";
import { describe, expect, it } from "vitest";
import type { z } from "zod";

import {
  AiError,
  type AiCallSpec,
  type AiClient,
  type AiResult,
} from "../../platform/ai/client.js";
import { ScriptedAiClient } from "../../platform/ai/scripted-client.js";
import { AiLayoutRemixer, type RemixContext } from "./remixer.js";

const usage = {
  model: "claude-sonnet-5",
  inputTokens: 2_400,
  outputTokens: 1_100,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
  costUsd: 0.05,
  durationMs: 24_000,
};

const ids = {
  intro: "11111111-1111-4111-8111-111111111111",
  work: "22222222-2222-4222-8222-222222222222",
};

const current: LayoutSpec = {
  type: { display: "serif-editorial", body: "sans-neutral", scaleRatio: 1.414, measure: 56 },
  palette: { ink: "#221A14", paper: "#FFFDF9", accent: "#9A4030", muted: "#6B6255" },
  rhythm: { density: "spacious", sectionGap: 104 },
  pageClassName: "font-body text-ink bg-paper break-keep",
  sectionLabelClassName: "text-step-1 font-mono tracking-widest text-accent",
  sections: [
    { portfolioSectionId: ids.intro, className: "px-10 pt-24 pb-16", innerClassName: "grid gap-6", items: [] },
    { portfolioSectionId: ids.work, className: "px-10 py-16", innerClassName: "grid gap-6", items: [] },
  ],
  blockClasses: { heading: "text-step4 font-display", paragraph: "text-step1 leading-relaxed" },
  rationale: "서사가 길어 읽기 좋은 좁은 폭으로 세웠습니다.",
};

const context: RemixContext = { userId: null,
  instruction: "더 차분하게, 간격을 좁혀 주세요",
  current,
  sections: [
    { portfolioSectionId: ids.intro, title: "소개" },
    { portfolioSectionId: ids.work, title: "장애 대응" },
  ],
  blockIds: [],
};

/** 초안은 섹션을 번호로 가리킨다. */
function draft(over: Partial<LayoutDraft> = {}): LayoutDraft {
  return {
    type: current.type,
    palette: current.palette,
    rhythm: { density: "comfortable", sectionGap: 64 },
    pageClassName: current.pageClassName,
    sectionLabelClassName: current.sectionLabelClassName,
    sections: [
      { section: 1, className: "px-10 pt-16 pb-10", innerClassName: "grid gap-4", items: [] },
      { section: 2, className: "px-10 py-10", innerClassName: "grid gap-4", items: [] },
    ],
    blockClasses: current.blockClasses,
    rationale: "지시대로 밀도를 올리고 섹션 간격을 좁혔습니다.",
    ...over,
  };
}

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

describe("지면 변형 계약", () => {
  it("지시와 지금 지면을 주고, 섹션은 번호로 가리킨다", async () => {
    const ai = new StubAiClient([draft()]);
    const next = await new AiLayoutRemixer(ai).remix(context);

    const prompt = ai.calls[0]?.prompt ?? "";
    expect(ai.calls[0]?.contract).toBe("style_remix");
    expect(prompt).toContain("지시: 더 차분하게, 간격을 좁혀 주세요");
    expect(prompt).toContain("1. 소개");
    expect(prompt).toContain('"section": 1');
    for (const id of Object.values(ids)) expect(prompt).not.toContain(id);

    expect(next.rhythm.density).toBe("comfortable");
    expect(next.sections.map(({ portfolioSectionId }) => portfolioSectionId))
      .toEqual([ids.intro, ids.work]);
    expect(next.rationale).toContain("지시대로");
  });

  it("섹션을 빠뜨리면 섹션 배치만 같은 대화에서 고쳐 받는다", async () => {
    const dropped = draft({
      sections: [{ section: 1, className: "px-10 py-10", innerClassName: "grid gap-4", items: [] }],
    });
    const ai = new ScriptedAiClient(() => dropped, () => [{ path: "/sections", value: draft().sections }]);
    const next = await new AiLayoutRemixer(ai).remix(context);

    expect(ai.calls).toHaveLength(1);
    expect(ai.fixRequests.map(({ paths }) => paths)).toEqual([["/sections"]]);
    expect(ai.fixRequests[0]?.prompt).toContain("2번 섹션을 빠뜨렸습니다");
    expect(next.sections.map(({ portfolioSectionId }) => portfolioSectionId)).toEqual([ids.intro, ids.work]);
  });

  /** 지금 지면을 번호로 그대로 옮긴 초안. */
  const same = () => draft({
    rhythm: current.rhythm,
    sections: current.sections.map((placement, index) => ({
      section: index + 1,
      className: placement.className,
      innerClassName: placement.innerClassName,
      items: [],
    })),
    rationale: current.rationale,
  });

  it("지면이 그대로면 지면 전체를 같은 대화에서 고쳐 받는다", async () => {
    const ai = new ScriptedAiClient(() => same(), () => [{ path: "/", value: draft() }]);
    const next = await new AiLayoutRemixer(ai).remix(context);

    expect(ai.calls).toHaveLength(1);
    expect(ai.fixRequests).toHaveLength(1);
    expect(ai.fixRequests[0]?.prompt).toContain("지면이 지금 지면과 같습니다");
    expect(next.rhythm.density).toBe("comfortable");
  });

  it("고친 뒤에도 지면이 그대로면 변형이 아니다", async () => {
    const ai = new ScriptedAiClient(() => same());
    await expect(new AiLayoutRemixer(ai).remix(context)).rejects.toThrow(/그대로/);
    expect(ai.calls).toHaveLength(1);
    // 걸린 칸이 줄지 않으면 한 번 고친 뒤 멈춘다(진전 기준, intent `ai-output-no-cli-rewrite`).
    expect(ai.fixRequests).toHaveLength(1);
  });

  it("읽을 수 없는 지면은 그 색 칸을 고쳐 받고, 못 고치면 AI_INVALID_OUTPUT으로 끝난다", async () => {
    const faded = draft({ palette: { ...current.palette, ink: "#BBBBBB" } });
    const ai = new ScriptedAiClient(() => faded);
    await expect(new AiLayoutRemixer(ai).remix(context)).rejects.toMatchObject({ code: "AI_INVALID_OUTPUT" });
    expect(ai.calls).toHaveLength(1);
    expect(ai.fixRequests[0]?.paths).toEqual(["/palette/ink", "/palette/paper"]);
  });

  it("막힌 클래스는 그 칸을 고쳐 받는다", async () => {
    const escaping = draft({
      sections: [
        { section: 1, className: "absolute inset-0", innerClassName: "grid gap-4", items: [] },
        { section: 2, className: "px-10 py-10", innerClassName: "grid gap-4", items: [] },
      ],
    });
    const ai = new ScriptedAiClient(() => escaping, () => [{ path: "/sections/0/className", value: "px-10 py-10" }]);
    const next = await new AiLayoutRemixer(ai).remix(context);
    expect(ai.calls).toHaveLength(1);
    expect(ai.fixRequests.map(({ paths }) => paths)).toEqual([["/sections/0/className"]]);
    expect(next.sections[0]?.className).toBe("px-10 py-10");
  });

  it("레이트 리밋은 다시 물어보지 않는다", async () => {
    const limited = new AiError("AI_RATE_LIMITED", "style_remix", "usage limit", { retryable: false });
    const ai = new StubAiClient([limited]);
    await expect(new AiLayoutRemixer(ai).remix(context)).rejects.toThrow(AiError);
    expect(ai.calls).toHaveLength(1);
  });
});
