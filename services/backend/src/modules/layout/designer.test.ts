import type { LayoutDraft } from "@expresso/contracts";
import { describe, expect, it } from "vitest";
import type { z } from "zod";

import {
  AiError,
  type AiCallSpec,
  type AiClient,
  type AiResult,
} from "../../platform/ai/client.js";
import { ScriptedAiClient } from "../../platform/ai/scripted-client.js";
import {
  AiLayoutDesigner,
  LayoutDesignError,
  toLayoutSpecs,
  type LayoutDesignContext,
} from "./designer.js";

const usage = {
  model: "claude-opus-5",
  inputTokens: 1_200,
  outputTokens: 2_400,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
  costUsd: 0.31,
  durationMs: 24_000,
};

const context: LayoutDesignContext = {
  sections: [
    {
      title: "핵심 소개",
      blocks: [{ number: 1, kind: "paragraph", preview: "물류 현장의 배차를", length: 180 }],
    },
    {
      title: "주요 경험",
      blocks: [{ number: 2, kind: "paragraph", preview: "새벽 배차 실패를", length: 320 }],
    },
  ],
  company: {
    name: "라인루프",
    industry: "물류 · 커머스",
    toneSummary: "현장과 숫자를 함께 본다",
    brandColors: ["#0F5132"],
  },
  jobTitle: "백엔드 엔지니어",
  jobFamily: "백엔드",
};

/** 후보 하나. 인자로 준 것만 다르게 만든다. */
function draft(
  display: LayoutDraft["type"]["display"],
  density: LayoutDraft["rhythm"]["density"],
  sections: number[],
): LayoutDraft {
  return {
    type: { display, body: "sans-neutral", scaleRatio: 1.25, measure: 60 },
    palette: { ink: "#16223A", paper: "#FFFFFF", accent: "#9A4030", muted: "#5A6473" },
    rhythm: { density, sectionGap: 72 },
    // 후보를 가르는 것은 서체(`display`)다. 전에는 지면 이름을 클래스 자리에
    // 붙여 구분했는데, 그건 어휘에 없는 문자열이라 이제 거절된다.
    pageClassName: "font-body text-ink bg-paper break-keep",
    sectionLabelClassName: "text-step-1 font-mono tracking-widest text-accent",
    sections: sections.map((section) => ({
      section,
      className: "px-8 py-12",
      innerClassName: "grid gap-5 max-w-measure mx-auto",
      items: [{ kind: "block" as const, block: section }],
    })),
    blockClasses: { paragraph: "text-step0 leading-relaxed text-pretty" },
    rationale: "서사가 길어 폭을 좁혔습니다.",
  };
}

function batch(sections: number[][]) {
  return {
    candidates: [
      draft("serif-editorial", "spacious", sections[0] ?? [1, 2]),
      draft("mono-technical", "compact", sections[1] ?? [1, 2]),
      draft("sans-geometric", "comfortable", sections[2] ?? [1, 2]),
    ],
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
      throw new AiError("AI_INVALID_OUTPUT", spec.contract, parsed.error.message, {
        retryable: true,
      });
    }
    return { data: parsed.data, usage };
  }
}

describe("지면 생성 계약", () => {
  it("모델이 낸 3안을 그대로 돌려준다", async () => {
    const ai = new StubAiClient([batch([[1, 2], [1, 2], [2, 1]])]);
    const drafts = await new AiLayoutDesigner(ai).design(context);

    expect(drafts).toHaveLength(3);
    expect(ai.calls[0]?.contract).toBe("layout_draft");
    // 프롬프트에는 섹션 번호와 회사 톤이 들어간다 — UUID는 들어가지 않는다.
    expect(ai.calls[0]?.prompt).toContain("1. 핵심 소개");
    expect(ai.calls[0]?.prompt).toContain("라인루프");
    expect(ai.calls[0]?.system).toContain("팔레트 토큰만");
  });

  it("섹션을 빠뜨린 안은 그 안의 섹션 배치만 같은 대화에서 고쳐 받는다", async () => {
    // 1안이 2번 섹션을 빠뜨렸다 — 그대로 두면 그 내용이 지면에서 사라진다.
    const ai = new ScriptedAiClient(
      () => batch([[1], [1, 2], [1, 2]]),
      () => [{ path: "/candidates/0/sections", value: batch([]).candidates[0]!.sections }],
    );
    const drafts = await new AiLayoutDesigner(ai).design(context);

    expect(ai.calls).toHaveLength(1);
    expect(ai.fixRequests.map(({ paths }) => paths)).toEqual([["/candidates/0/sections"]]);
    expect(ai.fixRequests[0]?.prompt).toContain("2번 섹션을 빠뜨렸습니다");
    expect(drafts[0]?.sections).toHaveLength(2);
  });

  it("고친 뒤에도 섹션을 빠뜨렸으면 그 지면은 내지 않는다", async () => {
    const ai = new ScriptedAiClient(() => batch([[1], [1], [1]]));
    await expect(new AiLayoutDesigner(ai).design(context)).rejects.toThrow(LayoutDesignError);
    expect(ai.calls).toHaveLength(1);
    // 세 안의 빠진 자리를 한 번에 묻는다. 고쳐도 줄지 않으면 거기서 멈춘다.
    expect(ai.fixRequests.map(({ paths }) => paths)).toEqual([
      ["/candidates/0/sections", "/candidates/1/sections", "/candidates/2/sections"],
    ]);
  });

  it("레이트 리밋은 다시 물어보지 않고 그대로 올린다", async () => {
    const limited = new AiError("AI_RATE_LIMITED", "layout_draft", "usage limit reached", {
      retryable: false,
    });
    const ai = new StubAiClient([limited]);
    await expect(new AiLayoutDesigner(ai).design(context)).rejects.toThrow(AiError);
    expect(ai.calls).toHaveLength(1);
  });

  it("대비가 모자란 팔레트는 그 색 칸만 고쳐 받는다", async () => {
    const faded = batch([]);
    // 흰 지면 위 옅은 회색 — 본문 4.5:1을 넘지 못한다.
    faded.candidates[1]!.palette.ink = "#B8BEC8";
    const ai = new ScriptedAiClient(() => faded, () => [{ path: "/candidates/1/palette/ink", value: "#16223A" }]);

    const drafts = await new AiLayoutDesigner(ai).design(context);
    expect(ai.calls).toHaveLength(1);
    // 계약은 같은 대비를 글자 쪽과 지면 쪽 두 칸에 붙인다. 둘 다 그 안의 팔레트 칸이다.
    expect(ai.fixRequests.map(({ paths }) => paths)).toEqual([["/candidates/1/palette/ink", "/candidates/1/palette/paper"]]);
    expect(drafts[1]?.palette.ink).toBe("#16223A");
  });

  it("고쳐도 계약을 못 맞추면 AI_INVALID_OUTPUT으로 끝난다", async () => {
    const escaping = batch([]);
    escaping.candidates[0]!.sections[0]!.className = "px-8 py-12 absolute inset-0";
    const ai = new ScriptedAiClient(() => escaping);

    await expect(new AiLayoutDesigner(ai).design(context)).rejects.toMatchObject({ code: "AI_INVALID_OUTPUT" });
    expect(ai.calls).toHaveLength(1);
    expect(ai.fixRequests[0]?.paths).toEqual(["/candidates/0/sections/0/className"]);
  });

  it("세 안이 서로 같으면 후보 배열을 고쳐 받는다", async () => {
    const same = {
      candidates: [
        draft("serif-editorial", "spacious", [1, 2]),
        draft("serif-editorial", "spacious", [1, 2]),
        draft("serif-editorial", "spacious", [1, 2]),
      ],
    };
    const ai = new ScriptedAiClient(() => same, () => [{ path: "/candidates", value: batch([]).candidates }]);

    const drafts = await new AiLayoutDesigner(ai).design(context);
    expect(ai.calls).toHaveLength(1);
    // 계약의 superRefine이 `candidates` 경로를 붙인다. 출력 전체(`/`)가 아니다.
    expect(ai.fixRequests[0]?.paths).toEqual(["/candidates"]);
    expect(new Set(drafts.map(({ type }) => type.display)).size).toBe(3);
  });

  it("섹션 번호를 실제 섹션 식별자로 바꾼다", () => {
    const ids = [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
    ];
    const specs = toLayoutSpecs(batch([[1, 2], [2, 1], [1, 2]]).candidates, ids);

    expect(specs[0]?.sections.map(({ portfolioSectionId }) => portfolioSectionId)).toEqual(ids);
    // 2안은 순서를 뒤집어 배치했다. 그 순서가 그대로 지면 순서가 된다.
    expect(specs[1]?.sections.map(({ portfolioSectionId }) => portfolioSectionId))
      .toEqual([ids[1], ids[0]]);
  });
});
