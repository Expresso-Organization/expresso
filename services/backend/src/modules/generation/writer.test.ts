import { GenerationDraftBlockSchema, type GenerationDraft } from "@expresso/contracts";
import { describe, expect, it } from "vitest";
import type { z } from "zod";

import {
  AiError,
  type AiCallSpec,
  type AiClient,
  type AiResult,
} from "../../platform/ai/client.js";
import {
  AiSentenceWriter,
  SentenceDraftError,
  toGenerationOutput,
  type WriterContext,
} from "./writer.js";

const usage = {
  model: "claude-sonnet-5",
  inputTokens: 2_100,
  outputTokens: 1_400,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
  costUsd: 0.04,
  durationMs: 18_000,
};

const ids = {
  intro: "11111111-1111-4111-8111-111111111111",
  work: "22222222-2222-4222-8222-222222222222",
  record: "33333333-3333-4333-8333-333333333333",
  requirement: "44444444-4444-4444-8444-444444444444",
};

const context: WriterContext = {
  sections: [
    {
      recipeSectionId: ids.intro,
      title: "핵심 소개",
      purpose: "무엇을 하는 사람인지",
      targetLength: 300,
      goal: "적재 안정성을 먼저 말한다",
      points: ["파이프라인 운영"],
      metrics: ["일 3,000만 건"],
      tone: "담백한 존댓말",
      format: "narrative",
      exclude: ["열정"],
      items: [{ pointText: "적재 파이프라인 운영", sourceNumbers: [1] }],
    },
    {
      recipeSectionId: ids.work,
      title: "장애 대응",
      purpose: "어떻게 되돌렸는지",
      targetLength: 400,
      goal: "",
      points: [],
      metrics: [],
      tone: "",
      format: "narrative",
      exclude: [],
      items: [{ pointText: "새벽 장애 복구", sourceNumbers: [1, 2] }],
    },
  ],
  evidence: [
    {
      id: ids.record,
      sourceType: "record",
      label: "적재 파이프라인 운영",
      text: "하루 3,000만 건을 적재하는 파이프라인을 운영했습니다.",
    },
    {
      id: ids.requirement,
      sourceType: "requirement",
      label: "대규모 데이터 처리 경험",
      text: "대규모 데이터 처리 경험",
    },
  ],
  company: { name: "당근", industry: "커뮤니티", toneSummary: "담백한 존댓말 · 과장 없음" },
  jobTitle: "데이터 플랫폼 엔지니어",
  lockedTexts: [],
};

function draft(blocks: Partial<z.infer<typeof GenerationDraftBlockSchema>>[]): GenerationDraft {
  return {
    blocks: blocks.map((block) => ({
      section: 1,
      kind: "paragraph" as const,
      text: "하루 3,000만 건을 적재하는 파이프라인을 맡았습니다.",
      sources: [1],
      ...block,
    })) as GenerationDraft["blocks"],
  };
}

/** 두 섹션을 다 채운 정상 초안. */
const filled = draft([{ section: 1 }, { section: 2, sources: [1, 2] }]);

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

describe("추출 계약", () => {
  it("섹션과 근거를 번호로 준다 — 프롬프트에 UUID는 없다", async () => {
    const ai = new StubAiClient([filled]);
    await new AiSentenceWriter(ai).write(context);

    const prompt = ai.calls[0]?.prompt ?? "";
    expect(ai.calls[0]?.contract).toBe("generation");
    expect(prompt).toContain("## 섹션 1. 핵심 소개 (목표 300자)");
    expect(prompt).toContain("- 적재 파이프라인 운영 [근거 1]");
    expect(prompt).toContain("1. [기록] 적재 파이프라인 운영");
    expect(prompt).toContain("2. [공고 요건] 대규모 데이터 처리 경험");
    expect(prompt).toContain("쓰면 안 되는 말: 열정");
    expect(prompt).toContain("당근");
    for (const id of Object.values(ids)) expect(prompt).not.toContain(id);
    // 근거 원문이 라벨과 같으면 두 번 싣지 않는다.
    expect(prompt.match(/대규모 데이터 처리 경험/g)).toHaveLength(1);
  });

  it("번호를 실제 식별자로 되돌린다", () => {
    const output = toGenerationOutput(filled, context);
    expect(output.blocks[0]?.recipeSectionId).toBe(ids.intro);
    expect(output.blocks[1]?.recipeSectionId).toBe(ids.work);
    expect(output.blocks[1]?.evidencePathIds).toEqual([ids.record, ids.requirement]);
  });

  it("없는 번호를 가리키면 그 근거만 버리고, 다 없으면 블록을 버린다", () => {
    const output = toGenerationOutput(
      draft([{ section: 1, sources: [1, 9] }, { section: 2, sources: [7] }]),
      context,
    );
    expect(output.blocks).toHaveLength(1);
    expect(output.blocks[0]?.evidencePathIds).toEqual([ids.record]);
  });

  it("빈 섹션이 있으면 다시 쓰게 한다", async () => {
    const ai = new StubAiClient([draft([{ section: 1 }]), filled]);
    const output = await new AiSentenceWriter(ai).write(context);

    expect(ai.calls).toHaveLength(2);
    expect(ai.calls[1]?.prompt).toContain("2번 섹션이 비었습니다");
    expect(output.blocks).toHaveLength(2);
  });

  it("수치 블록은 값 하나에 라벨이 붙는다", () => {
    const ok = GenerationDraftBlockSchema.safeParse({
      section: 1, kind: "metric", text: "3,000만 건", label: "일 적재량", sources: [1],
    });
    expect(ok.success).toBe(true);
    // 문장이 들어오면 지면이 크게 세울 자리가 무너진다.
    expect(GenerationDraftBlockSchema.safeParse({
      section: 1, kind: "metric", text: "하루 3,000만 건을 적재하는 파이프라인을 운영했습니다",
      label: "일 적재량", sources: [1],
    }).success).toBe(false);
    // 숫자가 없으면 수치가 아니다.
    expect(GenerationDraftBlockSchema.safeParse({
      section: 1, kind: "metric", text: "매우 많음", label: "적재량", sources: [1],
    }).success).toBe(false);
    // 라벨이 없으면 그 숫자가 무엇인지 알 수 없다.
    expect(GenerationDraftBlockSchema.safeParse({
      section: 1, kind: "metric", text: "24분", sources: [1],
    }).success).toBe(false);
  });

  it("목록은 두 항목 이상이고 글머리 기호는 걷어낸다", () => {
    expect(GenerationDraftBlockSchema.safeParse({
      section: 1, kind: "list", text: "Airflow", sources: [1],
    }).success).toBe(false);
    const output = toGenerationOutput(
      draft([{ section: 1, kind: "list", text: "- Airflow\n• Spark\n  dbt" }, { section: 2 }]),
      context,
    );
    expect(output.blocks[0]?.text).toBe("Airflow\nSpark\ndbt");
  });

  it("레이트 리밋은 다시 물어보지 않는다", async () => {
    const limited = new AiError("AI_RATE_LIMITED", "generation", "usage limit reached", {
      retryable: false,
    });
    const ai = new StubAiClient([limited]);
    await expect(new AiSentenceWriter(ai).write(context)).rejects.toThrow(AiError);
    expect(ai.calls).toHaveLength(1);
  });

  it("근거가 없으면 아예 부르지 않는다", async () => {
    const ai = new StubAiClient([filled]);
    await expect(new AiSentenceWriter(ai).write({ ...context, evidence: [] }))
      .rejects.toThrow(SentenceDraftError);
    expect(ai.calls).toHaveLength(0);
  });

  it("잠근 문장은 그대로 다시 내라고 알린다", async () => {
    const ai = new StubAiClient([filled]);
    await new AiSentenceWriter(ai).write({ ...context, lockedTexts: ["직접 고친 문장입니다."] });
    expect(ai.calls[0]?.prompt).toContain("직접 고친 문장입니다.");
    expect(ai.calls[0]?.prompt).toContain("한 글자도 바꾸지 말고");
  });
});
