import type { LayoutDraft, LayoutSpec } from "@expresso/contracts";
import { describe, expect, it } from "vitest";
import type { z } from "zod";

import {
  AiError,
  type AiCallSpec,
  type AiClient,
  type AiResult,
} from "../../platform/ai/client.js";
import { AiLayoutRemixer, LayoutRemixError, type RemixContext } from "./remixer.js";

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

const context: RemixContext = {
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

  it("섹션을 빠뜨리면 다시 고치게 한다", async () => {
    const dropped = draft({
      sections: [{ section: 1, className: "px-10 py-10", innerClassName: "grid gap-4", items: [] }],
    });
    const ai = new StubAiClient([dropped, draft()]);
    await new AiLayoutRemixer(ai).remix(context);

    expect(ai.calls).toHaveLength(2);
    expect(ai.calls[1]?.prompt).toContain("2번 섹션을 빠뜨렸습니다");
  });

  it("지면이 그대로면 변형이 아니다", async () => {
    const same = draft({
      rhythm: current.rhythm,
      sections: current.sections.map((placement, index) => ({
        section: index + 1,
        className: placement.className,
        innerClassName: placement.innerClassName,
        items: [],
      })),
      rationale: current.rationale,
    });
    const ai = new StubAiClient([same]);
    await expect(new AiLayoutRemixer(ai).remix(context)).rejects.toThrow(/그대로/);
  });

  it("읽을 수 없는 지면은 거절한다", async () => {
    const faded = draft({ palette: { ...current.palette, ink: "#BBBBBB" } });
    const ai = new StubAiClient([faded]);
    await expect(new AiLayoutRemixer(ai).remix(context)).rejects.toThrow(LayoutRemixError);
  });

  it("막힌 클래스는 거절한다", async () => {
    const escaping = draft({
      sections: [
        { section: 1, className: "absolute inset-0", innerClassName: "grid gap-4", items: [] },
        { section: 2, className: "px-10 py-10", innerClassName: "grid gap-4", items: [] },
      ],
    });
    const ai = new StubAiClient([escaping]);
    await expect(new AiLayoutRemixer(ai).remix(context)).rejects.toThrow(LayoutRemixError);
  });

  it("레이트 리밋은 다시 물어보지 않는다", async () => {
    const limited = new AiError("AI_RATE_LIMITED", "style_remix", "usage limit", { retryable: false });
    const ai = new StubAiClient([limited]);
    await expect(new AiLayoutRemixer(ai).remix(context)).rejects.toThrow(AiError);
    expect(ai.calls).toHaveLength(1);
  });
});
