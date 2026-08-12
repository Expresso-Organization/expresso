import type { RecordCleanup } from "@expresso/contracts";
import { describe, expect, it } from "vitest";
import type { z } from "zod";

import {
  AiError,
  type AiCallSpec,
  type AiClient,
  type AiResult,
} from "../../platform/ai/client.js";
import {
  AiRecordCleaner,
  RecordCleanupError,
  cleanupChangedFields,
  cleanupProperties,
  type CleanupContext,
} from "./record-cleaner.js";

const usage = {
  model: "claude-sonnet-5",
  inputTokens: 900,
  outputTokens: 600,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
  costUsd: 0.02,
  durationMs: 9_000,
};

const context: CleanupContext = {
  question: "정산 스케줄러를 재설계하면서 어떤 문제를 푸셨나요?",
  transcript:
    "매일 도는 정산 배치가 새벽에 자주 밀렸습니다. 큐 단위로 쪼개고 재시도를 붙여서 일 1,200만 건을 처리하도록 만들었습니다.",
  existing: null,
};

const cleaned: RecordCleanup = {
  title: "정산 배치를 큐 단위로 재설계",
  situation: "매일 도는 정산 배치가 새벽에 자주 밀렸습니다.",
  task: "밀리지 않게 처리 구조를 다시 잡는 일을 맡았습니다.",
  action: "큐 단위로 쪼개고 재시도를 붙였습니다.",
  result: "일 1,200만 건을 처리하도록 만들었습니다.",
  metrics: ["일 1,200만 건"],
  competencies: ["배치 파이프라인 설계", "재처리 설계"],
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

describe("기록 정리 계약", () => {
  it("질문과 답변을 함께 준다", async () => {
    const ai = new StubAiClient([cleaned]);
    const result = await new AiRecordCleaner(ai).clean(context);

    expect(ai.calls[0]?.contract).toBe("record_cleanup");
    expect(ai.calls[0]?.prompt).toContain("정산 스케줄러를 재설계하면서");
    expect(ai.calls[0]?.prompt).toContain("일 1,200만 건");
    expect(result.title).toBe("정산 배치를 큐 단위로 재설계");
  });

  it("말하지 않은 수치는 거절한다", async () => {
    // 답변에는 감소폭이 없다. "40%"는 지어낸 값이다.
    const invented = { ...cleaned, result: "지연을 40% 줄였습니다." };
    const ai = new StubAiClient([invented, cleaned]);
    const result = await new AiRecordCleaner(ai).clean(context);

    expect(ai.calls).toHaveLength(2);
    expect(ai.calls[1]?.prompt).toContain("답변에 없는 수치입니다: 40");
    expect(result.result).toBe("일 1,200만 건을 처리하도록 만들었습니다.");
  });

  it("두 번째도 지어내면 포기한다", async () => {
    const ai = new StubAiClient([{ ...cleaned, metrics: ["99.9% 가용성"] }]);
    await expect(new AiRecordCleaner(ai).clean(context)).rejects.toThrow(RecordCleanupError);
    expect(ai.calls).toHaveLength(2);
  });

  it("고쳐 쓴 답변은 기존 기록을 함께 본다", async () => {
    const ai = new StubAiClient([cleaned]);
    await new AiRecordCleaner(ai).clean({
      ...context,
      existing: { title: "정산 배치", bodyMd: "앞서 적은 내용입니다." },
    });
    expect(ai.calls[0]?.prompt).toContain("이미 있던 기록");
    expect(ai.calls[0]?.prompt).toContain("앞서 적은 내용입니다.");
  });

  it("비어 있는 항목은 속성으로 저장하지 않는다", () => {
    // "없다"와 "안 물어봤다"가 구분되지 않으면 나중에 다시 물을 수 없다.
    const partial: RecordCleanup = {
      ...cleaned, task: null, result: null, metrics: [], competencies: [],
    };
    expect(cleanupProperties(partial)).toEqual({
      situation: cleaned.situation,
      action: cleaned.action,
    });
    expect(cleanupChangedFields(partial)).toEqual(["title", "body_md", "situation", "action"]);
    expect(Object.keys(cleanupProperties(cleaned))).toHaveLength(6);
  });

  it("레이트 리밋은 다시 물어보지 않는다", async () => {
    const limited = new AiError("AI_RATE_LIMITED", "record_cleanup", "usage limit", { retryable: false });
    const ai = new StubAiClient([limited]);
    await expect(new AiRecordCleaner(ai).clean(context)).rejects.toThrow(AiError);
    expect(ai.calls).toHaveLength(1);
  });
});
