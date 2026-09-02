import type { CareerDocument, CareerEditCommand } from "@expresso/editor";
import { CareerEditCommandSchema } from "@expresso/editor/commands";
import { AiEditProposalSchema, type AiEditProposal } from "@expresso/contracts";
import { z } from "zod";

import type { AiClient } from "../../platform/ai/client.js";

export interface AiProposalGenerationInput {
  readonly recordId: string;
  readonly documentVersion: number;
  readonly selectionBlockIds: readonly string[];
  readonly selectedBlocks: ReadonlyArray<CareerDocument["content"][number]>;
  readonly prompt: string;
  readonly signal: AbortSignal;
}
export interface AiProposalGenerationResult {
  readonly summary: string;
  readonly commands: ReadonlyArray<CareerEditCommand>;
  readonly propertyChanges: ReadonlyArray<AiEditProposal["propertyChanges"][number]>;
}
export interface AiProposalAdapter { generate(input: AiProposalGenerationInput): Promise<AiProposalGenerationResult> }

const AiProposalGenerationResultSchema = z.strictObject({
  summary: z.string().trim().min(1).max(2_000),
  commands: z.array(CareerEditCommandSchema).max(100),
  propertyChanges: AiEditProposalSchema.shape.propertyChanges,
});

/** 키가 없는 기본 runtime은 예측하지 않고, 검토 가능한 빈 제안만 만든다. */
export class DeterministicAiProposalAdapter implements AiProposalAdapter {
  constructor(private readonly result: Partial<AiProposalGenerationResult> = {}) {}
  async generate(input: AiProposalGenerationInput): Promise<AiProposalGenerationResult> {
    if (input.signal.aborted) throw new DOMException("AI proposal cancelled", "AbortError");
    return {
      summary: this.result.summary ?? `선택한 ${input.selectionBlockIds.length}개 블록을 검토했습니다`,
      commands: this.result.commands ?? [], propertyChanges: this.result.propertyChanges ?? [],
    };
  }
}

/** Playwright 서버에서만 쓰는 명시적 fixture. 선택 첫 블록 밖으로는 쓰지 않는다. */
export class SelectedBlockTextAiProposalAdapter implements AiProposalAdapter {
  async generate(input: AiProposalGenerationInput): Promise<AiProposalGenerationResult> {
    const blockId = input.selectionBlockIds[0];
    if (!blockId) return { summary: "선택 블록이 없습니다", commands: [], propertyChanges: [] };
    return { summary: "테스트용 AI 제안", commands: [{ type: "setText", blockId, text: `AI 제안: ${input.prompt}` }], propertyChanges: [] };
  }
}

/** 기존 구조화 AI 포트에 선택 블록과 현재 문서 버전만 전달하는 운영 어댑터입니다. */
export class AiClientProposalAdapter implements AiProposalAdapter {
  constructor(private readonly client: AiClient) {}
  async generate(input: AiProposalGenerationInput): Promise<AiProposalGenerationResult> {
    if (input.signal.aborted) throw new DOMException("AI proposal cancelled", "AbortError");
    const prompt = JSON.stringify({
      recordId: input.recordId,
      documentVersion: input.documentVersion,
      selectionBlockIds: [...input.selectionBlockIds],
      selectedBlocks: input.selectedBlocks,
      instruction: input.prompt,
    });
    const result = await this.client.complete({
      contract: "partial_edit",
      promptVersion: 1,
      system: "선택된 커리어 기록 블록만 고치는 JSON 변경 제안을 작성합니다. 선택 밖의 블록 ID를 만들거나 원문에 없는 사실과 수치를 추가하지 마십시오.",
      prompt,
    }, AiProposalGenerationResultSchema);
    if (input.signal.aborted) throw new DOMException("AI proposal cancelled", "AbortError");
    return result.data;
  }
}
