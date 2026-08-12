import { describe, expect, it } from "vitest";
import type { z } from "zod";

import {
  AiError,
  type AiCallSpec,
  type AiClient,
  type AiResult,
} from "../../platform/ai/client.js";
import {
  AiBlockEditor,
  BlockEditError,
  applyPatches,
  blockFields,
  type EditContext,
} from "./editor.js";

const usage = {
  model: "claude-sonnet-5",
  inputTokens: 700,
  outputTokens: 400,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
  costUsd: 0.01,
  durationMs: 8_000,
};

const before =
  "매일 도는 정산 스케줄러를 다시 만들어 일 1,200만 건을 처리하도록 했습니다. 큐로 나눠 처리하는 구조로 바꾸고, 재처리 절차를 문서로 남겼습니다.";

const context: EditContext = {
  instruction: "한 문장으로 줄여 주세요",
  block: { kind: "paragraph", fields: { "content.text": before } },
  section: {
    title: "대용량 정산 스케줄러 재설계",
    purpose: "처리 구조를 다시 설계할 수 있는 사람임을 남긴다",
    goal: "공고의 대규모 처리 요구에 답한다",
    tone: "담백한 존댓말",
    exclude: ["업계 최고"],
  },
  sourceText: "매일 도는 정산 스케줄러를 다시 만들었습니다. 일 1,200만 건을 처리합니다.",
};

const shortened = {
  patches: [{
    path: "content.text",
    before,
    after: "정산 스케줄러를 큐 단위로 다시 설계해 일 1,200만 건을 처리하도록 했습니다.",
    label: "두 문장을 한 문장으로 합쳤습니다",
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

describe("부분 편집 계약", () => {
  it("지시 · 섹션 컨텍스트 · 고칠 수 있는 자리를 준다", async () => {
    const ai = new StubAiClient([shortened]);
    const patches = await new AiBlockEditor(ai).edit(context);

    const prompt = ai.calls[0]?.prompt ?? "";
    expect(ai.calls[0]?.contract).toBe("partial_edit");
    expect(prompt).toContain("지시: 한 문장으로 줄여 주세요");
    expect(prompt).toContain("쓰면 안 되는 말: 업계 최고");
    expect(prompt).toContain("고칠 수 있는 자리: content.text");
    expect(patches[0]?.label).toBe("두 문장을 한 문장으로 합쳤습니다");
  });

  it("없던 수치를 붙이면 다시 고치게 한다", async () => {
    const invented = {
      patches: [{
        ...shortened.patches[0]!,
        after: "정산 스케줄러를 다시 설계해 지연을 30% 줄였습니다.",
      }],
    };
    const ai = new StubAiClient([invented, shortened]);
    await new AiBlockEditor(ai).edit(context);

    expect(ai.calls).toHaveLength(2);
    expect(ai.calls[1]?.prompt).toContain("글에 없던 수치입니다: 30");
  });

  it("섹션이 쓰지 말라고 한 말은 거절한다", async () => {
    const banned = {
      patches: [{ ...shortened.patches[0]!, after: "업계 최고의 정산 스케줄러를 만들었습니다." }],
    };
    const ai = new StubAiClient([banned]);
    await expect(new AiBlockEditor(ai).edit(context)).rejects.toThrow(/쓰지 않기로 한 말/);
  });

  it("없는 자리는 고칠 수 없다", async () => {
    const stray = {
      patches: [{ path: "content.value", before: "", after: "24분", label: "수치 추가" }],
    };
    const ai = new StubAiClient([stray]);
    await expect(new AiBlockEditor(ai).edit(context)).rejects.toThrow(/고칠 수 있는 자리가 아닙니다/);
  });

  it("아무것도 안 바뀌면 변경이 아니다", async () => {
    const same = { patches: [{ ...shortened.patches[0]!, after: before }] };
    const ai = new StubAiClient([same]);
    await expect(new AiBlockEditor(ai).edit(context)).rejects.toThrow(/바뀐 것이 없습니다/);
  });

  it("before는 우리가 아는 값으로 덮는다", async () => {
    // 모델이 옮겨 적다 틀리면 변경 요약이 거짓말을 한다.
    const drifted = { patches: [{ ...shortened.patches[0]!, before: "모델이 잘못 옮긴 값" }] };
    const ai = new StubAiClient([drifted]);
    const patches = await new AiBlockEditor(ai).edit(context);
    expect(patches[0]?.before).toBe(before);
  });

  it("미디어 블록은 말로 고칠 수 없다", async () => {
    const ai = new StubAiClient([shortened]);
    await expect(new AiBlockEditor(ai).edit({
      ...context, block: { kind: "media", fields: {} },
    })).rejects.toThrow(BlockEditError);
    expect(ai.calls).toHaveLength(0);
  });

  it("수치 블록은 값과 라벨 두 자리를 연다", () => {
    const fields = blockFields("metric", { value: "1,200만 건", label: "일 처리 건수" });
    expect(fields).toEqual({ "content.value": "1,200만 건", "content.label": "일 처리 건수" });
    expect(applyPatches({ value: "1,200만 건", label: "일 처리 건수" }, [
      { path: "content.label", before: "일 처리 건수", after: "하루 처리량", label: "라벨을 줄였습니다" },
    ])).toEqual({ value: "1,200만 건", label: "하루 처리량" });
  });

  it("레이트 리밋은 다시 물어보지 않는다", async () => {
    const limited = new AiError("AI_RATE_LIMITED", "partial_edit", "usage limit", { retryable: false });
    const ai = new StubAiClient([limited]);
    await expect(new AiBlockEditor(ai).edit(context)).rejects.toThrow(AiError);
    expect(ai.calls).toHaveLength(1);
  });
});
