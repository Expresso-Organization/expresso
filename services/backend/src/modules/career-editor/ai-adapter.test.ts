import { randomUUID } from "node:crypto";

import { parseToolOutput, toToolSchema, type AiCallSpec, type AiClient, type AiResult } from "../../platform/ai/client.js";
import type { z } from "zod";
import { describe, expect, it } from "vitest";

import { AiClientProposalAdapter, AiProposalGenerationResultSchema } from "./ai-adapter.js";

class StubAiClient implements AiClient {
  spec: AiCallSpec | null = null;
  async complete<T>(spec: AiCallSpec, schema: z.ZodType<T>): Promise<AiResult<T>> {
    this.spec = spec;
    return {
      data: schema.parse({ summary: "성과를 선명하게 정리", commands: [], propertyChanges: [] }),
      usage: { model: "fixture", inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheCreationTokens: 0, costUsd: null, durationMs: 1 },
    };
  }
}

describe("AiClientProposalAdapter", () => {
  it("sends canonical selected-block context through the partial_edit contract", async () => {
    const client = new StubAiClient(); const adapter = new AiClientProposalAdapter(client);
    const recordId = randomUUID(); const blockId = randomUUID();
    await expect(adapter.generate({ recordId, documentVersion: 7, selectionBlockIds: [blockId], selectedBlocks: [{ id: blockId, type: "paragraph", attrs: {}, text: [{ text: "원문" }] }], prompt: "성과 중심으로", signal: new AbortController().signal })).resolves.toMatchObject({ summary: "성과를 선명하게 정리" });
    expect(client.spec).toMatchObject({ contract: "partial_edit", promptVersion: 1 });
    expect(JSON.parse(client.spec!.prompt)).toEqual({ recordId, documentVersion: 7, selectionBlockIds: [blockId], selectedBlocks: [{ id: blockId, type: "paragraph", attrs: {}, text: [{ text: "원문" }] }], instruction: "성과 중심으로" });
  });

  it("does not publish a live result after cancellation", async () => {
    const controller = new AbortController(); controller.abort();
    const adapter = new AiClientProposalAdapter(new StubAiClient());
    await expect(adapter.generate({ recordId: randomUUID(), documentVersion: 1, selectionBlockIds: [], selectedBlocks: [], prompt: "취소", signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
  });

  it("한 번만 부르고, 업무 규칙 검사(check)를 걸지 않는다", async () => {
    const calls: unknown[] = [];
    const client: AiClient = {
      async complete(spec, schema, options) {
        calls.push(options);
        return { data: schema.parse({ summary: "정리", commands: [], propertyChanges: [] }), usage: { model: "fixture", inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheCreationTokens: 0, costUsd: null, durationMs: 1 } };
      },
    };
    await new AiClientProposalAdapter(client).generate({ recordId: randomUUID(), documentVersion: 1, selectionBlockIds: [], selectedBlocks: [], prompt: "정리", signal: new AbortController().signal });
    expect(calls).toEqual([undefined]);
  });
});

describe("partial_edit 출력의 null", () => {
  const blockId = randomUUID();
  /** 모델이 선택 칸(content · marks)을 null로 적고, 진짜 nullable인 afterBlockId와 attrs 안 JSON 값도 null로 보낸 출력. */
  const output = {
    summary: "맨 앞에 요약 문단 추가",
    commands: [
      {
        type: "insertBlocks",
        afterBlockId: null,
        blocks: [{ id: blockId, type: "paragraph", attrs: { level: null }, content: null, text: [{ text: "요약", marks: null }] }],
      },
      { type: "moveBlock", blockId, afterBlockId: null },
    ],
    propertyChanges: [],
  };

  it("선택 칸의 null만 걷어 내고 afterBlockId · attrs의 null은 남긴다", () => {
    const parsed = parseToolOutput(AiProposalGenerationResultSchema, output);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.commands).toEqual([
      { type: "insertBlocks", afterBlockId: null, blocks: [{ id: blockId, type: "paragraph", attrs: { level: null }, text: [{ text: "요약" }] }] },
      { type: "moveBlock", blockId, afterBlockId: null },
    ]);
  });

  it("공급자 형식은 선택 칸을 필수로 만들지 않는다", () => {
    const tool = JSON.stringify(toToolSchema(AiProposalGenerationResultSchema));
    // 걷어 내는 전처리를 거쳐도 출력 형식은 계약의 모양 그대로다.
    expect(JSON.parse(tool).properties).toHaveProperty("commands");
    // 필수 칸은 공급자 형식이 아니라 설명 문장으로 갑니다(빠지면 계약 검사에 걸려 그 칸만 고쳐 받습니다).
    expect(tool).toContain("꼭 쓰는 칸: type, afterBlockId, blocks");
    expect(tool).toContain("꼭 쓰는 칸: id, type, attrs");
    expect(tool).not.toContain('"required"');
  });
});

