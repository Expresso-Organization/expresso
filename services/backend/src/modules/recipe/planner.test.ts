import type { RecipeDraft } from "@expresso/contracts";
import { describe, expect, it } from "vitest";
import type { z } from "zod";

import {
  AiError,
  type AiCallSpec,
  type AiClient,
  type AiResult,
} from "../../platform/ai/client.js";
import {
  AiRecipePlanner,
  DeterministicRecipePlanner,
  type PlannerContext,
} from "./planner.js";

const usage = {
  model: "claude-opus-5",
  inputTokens: 3_000,
  outputTokens: 2_000,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
  costUsd: 0.28,
  durationMs: 40_000,
};

const context: PlannerContext = {
  sources: [
    { type: "record", id: "r1", label: "정산 스케줄러 재설계", text: "일 1,200만 건을 처리합니다." },
    { type: "record", id: "r2", label: "야간 배치 안정화", text: "실패율을 줄였습니다." },
    { type: "record", id: "r3", label: "프런트 화면 개편", text: "리액트로 다시 만들었습니다." },
    { type: "requirement", id: "q1", label: "대규모 처리 경험", text: "대규모 처리 경험" },
    { type: "answer", id: "a1", label: "가장 어려웠던 장애는?", text: "새벽 3시 적재 중단이었습니다." },
  ],
  company: { name: "당근", industry: "커뮤니티", toneSummary: "담백한 존댓말" },
  jobTitle: "데이터 플랫폼 엔지니어",
  requirements: [{ label: "대규모 처리 경험", kind: "must" }],
  companyResearch: [],
  totalLength: 900,
};

function section(over: Partial<RecipeDraft["sections"][number]> = {}) {
  return {
    title: "적재 안정성",
    purpose: "무엇을 하는 사람인지",
    targetLength: 300,
    goal: "공고의 대규모 처리 요구에 답한다",
    points: ["처리량"],
    metrics: ["일 1,200만 건"],
    tone: "담백한 존댓말",
    format: "narrative" as const,
    exclude: ["열정"],
    takeaway: "대규모 처리 경험",
    contentPattern: "case-study" as const,
    interactionOpportunity: null,
    items: [{ pointText: "일 1,200만 건 처리 · 큐 분리", sources: [1] }],
    ...over,
  };
}

const plan: RecipeDraft = {
  plan: {
    positioning: {
      headlineIntent: "대규모 데이터 처리 경험",
      valueProposition: "배치 안정성과 처리량 개선",
      differentiators: ["수치로 확인되는 운영 경험"],
    },
    requirementCoverage: [{
      requirementSource: 4,
      priority: 1,
      evidenceSources: [1, 2],
      coverage: "covered",
      reason: "두 기록이 대규모 처리와 안정성을 뒷받침",
    }],
    narrativeArc: "대규모 처리에서 장애 대응과 공고 적합성으로 진행",
    claims: [{
      intent: "대규모 처리 경험",
      evidenceSources: [1],
      allowedNumbers: ["1,200만"],
    }],
    exclusions: ["근거 없는 수치"],
    rationale: "공고의 핵심 요건과 가장 직접적인 기록을 먼저 배치",
  },
  sections: [
    section(),
    section({ title: "장애 대응", items: [{ pointText: "새벽 적재 중단 · 복구 절차", sources: [2, 5] }] }),
    section({ title: "공고 대응", items: [{ pointText: "대규모 처리 경험 대조", sources: [4] }] }),
  ],
  unused: [{ source: 3, reason: "공고가 프런트엔드를 묻지 않아 뺐다" }],
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

describe("레시피 생성 계약", () => {
  it("공고와 재료를 번호로 준다 — UUID는 없다", async () => {
    const ai = new StubAiClient([plan]);
    await new AiRecipePlanner(ai).plan(context);

    const prompt = ai.calls[0]?.prompt ?? "";
    expect(ai.calls[0]?.contract).toBe("recipe_draft");
    expect(prompt).toContain("1. [기록] 정산 스케줄러 재설계");
    expect(prompt).toContain("4. [공고 요건] 대규모 처리 경험");
    expect(prompt).toContain("5. [인터뷰 답변] 가장 어려웠던 장애는?");
    expect(prompt).toContain("전체 분량은 900자다");
    expect(prompt).not.toContain("r1");
    // 요건은 배치 대상이면서 동시에 "무엇을 향해 짜는가"의 기준이다.
    expect(prompt).toContain("## 공고가 요구하는 것");
  });

  it("재료가 없어도 한 번의 편집 가능한 계획을 반환한다", async () => {
    const emptyPlan = {
      ...plan,
      plan: {
        ...plan.plan,
        positioning: { ...plan.plan.positioning, differentiators: [] },
        requirementCoverage: [],
        claims: [],
      },
      sections: [{
        ...section(),
        targetLength: 0,
        points: [],
        metrics: [],
        exclude: [],
        items: [],
      }],
      unused: [],
    };
    const ai = new StubAiClient([emptyPlan]);
    const result = await new AiRecipePlanner(ai).plan({ ...context, sources: [], requirements: [] });

    expect(result.attempts).toBe(1);
    expect(result.draft.sections[0]?.items).toEqual([]);
    expect(ai.calls).toHaveLength(1);
  });

  it("완성 문장도 한 번의 설계안으로 보존한다", async () => {
    const wrote = {
      ...plan,
      sections: [
        section({ items: [{ pointText: "일 1,200만 건을 처리했습니다.", sources: [1] }] }),
        plan.sections[1]!,
        plan.sections[2]!,
      ],
    };
    const ai = new StubAiClient([wrote]);
    await new AiRecipePlanner(ai).plan(context);

    expect(ai.calls).toHaveLength(1);
  });

  it("편집상 중복도 재생성 사유가 아니다", async () => {
    const doubled = {
      ...plan,
      sections: [
        plan.sections[0]!,
        section({ title: "장애 대응", items: [{ pointText: "같은 기록 재활용", sources: [1] }] }),
        plan.sections[2]!,
      ],
    };
    const ai = new StubAiClient([doubled]);
    await new AiRecipePlanner(ai).plan(context);
    expect(ai.calls).toHaveLength(1);
  });

  it("편집상 참조와 분량 어긋남도 재생성하지 않는다", async () => {
    const wrong = {
      ...plan,
      sections: [section({ items: [{ pointText: "없는 재료", sources: [9] }] }), plan.sections[1]!, plan.sections[2]!],
    };
    const ai = new StubAiClient([wrong]);
    await new AiRecipePlanner(ai).plan(context);
    expect(ai.calls).toHaveLength(1);

    const short = {
      ...plan,
      sections: plan.sections.map((item) => ({ ...item, targetLength: 100 })),
    };
    const second = new StubAiClient([short]);
    await new AiRecipePlanner(second).plan(context);
    expect(second.calls).toHaveLength(1);
  });

  it("폴백은 종류별로 둘씩 골라 세 갈래를 다 넣는다", async () => {
    const { draft } = await new DeterministicRecipePlanner().plan(context);
    const cited = draft.sections.flatMap(({ items }) => items.flatMap(({ sources }) => sources));
    const types = new Set(cited.map((number) => context.sources[number - 1]?.type));

    expect(types).toEqual(new Set(["record", "requirement", "answer"]));
    // 안 쓴 기록은 이유와 함께 남는다.
    expect(draft.unused.map(({ source }) => source)).toEqual([3]);
  });

  it("회사 조사 정보는 맥락으로만 주고 사용자 주장 근거로 쓰지 못하게 한다", async () => {
    const companyContext = {
      ...context,
      companyResearch: [{
        id: "11111111-1111-4111-8111-111111111111",
        companyId: "22222222-2222-4222-8222-222222222222",
        kind: "fact" as const,
        topic: "product",
        statement: "지역 커뮤니티 제품을 운영한다",
        sourceUrl: "https://example.com/company",
        publishedAt: null,
        capturedAt: "2026-08-12T00:00:00.000Z",
        confidence: "high" as const,
        basisFactIds: [],
      }],
    };
    const ai = new StubAiClient([plan]);
    await new AiRecipePlanner(ai).plan(companyContext);
    const prompt = ai.calls[0]?.prompt ?? "";
    expect(prompt).toContain("회사 조사 — 맥락과 우선순위에만 쓴다");
    expect(prompt).toContain("https://example.com/company");

    const misused = {
      ...plan,
      plan: {
        ...plan.plan,
        claims: [{ intent: "회사 제품 운영", evidenceSources: [4], allowedNumbers: [] }],
      },
    };
    const invalid = new StubAiClient([misused]);
    await new AiRecipePlanner(invalid).plan(companyContext);
    expect(invalid.calls).toHaveLength(1);
  });
});
