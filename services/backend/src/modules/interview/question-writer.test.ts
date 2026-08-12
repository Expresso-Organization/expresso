import { InterviewQuestionDraftSchema } from "@expresso/contracts";
import { describe, expect, it } from "vitest";
import type { z } from "zod";

import {
  AiError,
  type AiCallSpec,
  type AiClient,
  type AiResult,
} from "../../platform/ai/client.js";
import {
  AiQuestionWriter,
  QuestionDraftError,
  countMentions,
  type QuestionBasisOption,
  type QuestionContext,
} from "./question-writer.js";

const usage = {
  model: "claude-sonnet-5",
  inputTokens: 1_800,
  outputTokens: 900,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
  costUsd: 0.03,
  durationMs: 12_000,
};

const ids = {
  requirement: "11111111-1111-4111-8111-111111111111",
  record: "22222222-2222-4222-8222-222222222222",
};

const options: QuestionBasisOption[] = [
  {
    basis: {
      type: "requirement",
      requirementId: ids.requirement,
      coverage: "missing",
      evidence: "Airflow 기반 배치 파이프라인 설계 및 개발",
    },
    label: "[공고 요건 · 안 채움] Airflow 배치 파이프라인",
    detail: "Airflow 기반 배치 파이프라인 설계 및 개발",
    mentions: { term: "Airflow", count: 3 },
  },
  {
    basis: { type: "record_gap", recordId: ids.record, gap: "metric", evidence: "온보딩 두 달" },
    label: "[기록 · 수치 없음] 신입 두 명을 동시에 온보딩한 두 달",
    detail: "본문입니다.",
    mentions: null,
  },
  {
    basis: {
      type: "requirement",
      requirementId: "33333333-3333-4333-8333-333333333333",
      coverage: "partial",
      evidence: "데이터 정합성 보장",
    },
    label: "[공고 요건 · 일부만] 데이터 정합성",
    detail: "데이터 정합성 보장",
    mentions: { term: "정합성", count: 1 },
  },
];

const context: QuestionContext = {
  options,
  company: { name: "뱅크샐러드", industry: "핀테크", toneSummary: "담백한 존댓말" },
  jobTitle: "데이터 파이프라인 엔지니어",
  materials: ["정산 스케줄러 재설계"],
};

const good = {
  questions: [
    { basis: 1, text: "Airflow로 어떤 배치를 돌려 보셨나요?", rationale: "공고가 Airflow를 3번 언급했는데 기록에는 없습니다." },
    { basis: 2, text: "온보딩 두 달 동안 무엇이 달라졌나요?", rationale: "결과를 보여줄 수치가 빠져 있습니다." },
    { basis: 3, text: "정합성을 어떻게 확인하셨나요?", rationale: "공고가 정합성 보장을 요구합니다." },
  ],
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

describe("질문 생성 계약", () => {
  it("근거를 번호로 준다 — UUID도 세지 않은 숫자도 없다", async () => {
    const ai = new StubAiClient([good]);
    const drafted = await new AiQuestionWriter(ai).draft(context);

    const prompt = ai.calls[0]?.prompt ?? "";
    expect(ai.calls[0]?.contract).toBe("question_draft");
    expect(prompt).toContain("1. [공고 요건 · 안 채움] Airflow 배치 파이프라인");
    // 언급 횟수는 우리가 센 값이다. 모델이 짐작하게 두지 않는다.
    expect(prompt).toContain('공고가 "Airflow"를 3번 언급했다');
    // 한 번만 언급된 것은 굳이 알리지 않는다.
    expect(prompt).not.toContain('"정합성"를 1번');
    expect(prompt).toContain("## 이미 고른 재료");
    for (const id of Object.values(ids)) expect(prompt).not.toContain(id);

    expect(drafted.map(({ optionIndex }) => optionIndex)).toEqual([0, 1, 2]);
    expect(drafted[0]?.rationale).toContain("3번 언급");
  });

  it("예/아니오로 답할 질문은 계약이 거절한다", () => {
    // 한국어에서 예/아니오는 어미가 아니라 의문사의 유무로 갈린다.
    expect(InterviewQuestionDraftSchema.safeParse({
      basis: 1, text: "Airflow를 써 보셨나요?", rationale: "공고 요건입니다.",
    }).success).toBe(false);
    expect(InterviewQuestionDraftSchema.safeParse({
      basis: 1, text: "Airflow로 무엇을 만드셨나요?", rationale: "공고 요건입니다.",
    }).success).toBe(true);
  });

  it("한 번에 두 가지를 물으면 거절한다", () => {
    expect(InterviewQuestionDraftSchema.safeParse({
      basis: 1,
      text: "무엇을 만드셨나요? 그리고 결과는 어떠했나요?",
      rationale: "공고 요건입니다.",
    }).success).toBe(false);
  });

  it("없는 번호와 겹치는 번호는 그 질문만 버린다", async () => {
    const messy = {
      questions: [
        good.questions[0]!,
        { ...good.questions[1]!, basis: 9 },
        { ...good.questions[2]!, basis: 1 },
      ],
    };
    // 남은 것이 하나뿐이라 다시 쓰게 한다.
    const ai = new StubAiClient([messy, good]);
    const drafted = await new AiQuestionWriter(ai).draft(context);

    expect(ai.calls).toHaveLength(2);
    expect(ai.calls[1]?.prompt).toContain("근거에 붙은 질문이 1개뿐입니다");
    expect(drafted).toHaveLength(3);
  });

  it("레이트 리밋은 다시 물어보지 않는다", async () => {
    const limited = new AiError("AI_RATE_LIMITED", "question_draft", "usage limit", { retryable: false });
    const ai = new StubAiClient([limited]);
    await expect(new AiQuestionWriter(ai).draft(context)).rejects.toThrow(AiError);
    expect(ai.calls).toHaveLength(1);
  });

  it("물을 자리가 없으면 부르지 않는다", async () => {
    const ai = new StubAiClient([good]);
    await expect(new AiQuestionWriter(ai).draft({ ...context, options: [] }))
      .rejects.toThrow(QuestionDraftError);
    expect(ai.calls).toHaveLength(0);
  });

  it("다시 묻기는 이미 나온 질문을 피하게 한다", async () => {
    const ai = new StubAiClient([{
      text: "그 배치가 멈췄을 때 어떻게 되돌리셨나요?",
      rationale: "운영 경험을 확인합니다.",
    }]);
    const rewritten = await new AiQuestionWriter(ai).rewrite({
      option: options[0]!,
      previousTexts: ["Airflow로 어떤 배치를 돌려 보셨나요?"],
      company: context.company,
      jobTitle: context.jobTitle,
    });

    expect(ai.calls[0]?.system).toContain("다른 각도에서");
    expect(ai.calls[0]?.prompt).toContain("Airflow로 어떤 배치를 돌려 보셨나요?");
    expect(rewritten.text).toContain("어떻게");
  });

  it("언급 횟수는 세는 것이지 짐작하는 것이 아니다", () => {
    const raw = "Airflow 기반 배치 개발. Airflow 운영 경험 우대. airflow DAG 관리.";
    expect(countMentions("Airflow 배치 파이프라인", raw)).toEqual({ term: "Airflow", count: 3 });
    // 라벨에서 가장 긴 낱말을 고른다.
    expect(countMentions("데이터 정합성 보장", "데이터 정합성 보장이 중요합니다.")?.term).toBe("정합성");
    expect(countMentions("Kafka", "이 공고에는 없는 말")).toBeNull();
  });
});
