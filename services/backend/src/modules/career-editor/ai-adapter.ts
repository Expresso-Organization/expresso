import type { CareerDocument, CareerEditCommand } from "@expresso/editor";
import type { AiEditProposal } from "@expresso/contracts";

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
