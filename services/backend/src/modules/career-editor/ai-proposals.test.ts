import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

import { DeterministicAiProposalAdapter } from "./ai-adapter.js";

describe("deterministic AI proposal adapter", () => {
  it("never invents a durable document update when AI is disabled", async () => {
    const adapter = new DeterministicAiProposalAdapter();
    const result = await adapter.generate({ recordId: randomUUID(), documentVersion: 0, selectionBlockIds: [randomUUID()], selectedBlocks: [], prompt: "정리", signal: new AbortController().signal });
    expect(result.commands).toEqual([]);
    expect(result.propertyChanges).toEqual([]);
  });
});
