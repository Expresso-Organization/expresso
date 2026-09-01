import { randomUUID } from "node:crypto";

import type { AiCallSpec, AiClient, AiResult } from "../../platform/ai/client.js";
import type { z } from "zod";
import { describe, expect, it } from "vitest";

import { AiClientProposalAdapter } from "./ai-adapter.js";

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
});
