"use client";

import type { AiEditProposal } from "@expresso/contracts";

import styles from "./ai.module.css";

function commandLabel(command: AiEditProposal["commands"][number]): string {
  if (command.type === "insertBlocks") return `블록 ${command.blocks.length}개 추가`;
  if (command.type === "replaceBlock") return "블록 전체 교체";
  if (command.type === "deleteBlocks") return `블록 ${command.blockIds.length}개 삭제`;
  if (command.type === "moveBlock") return "블록 위치 이동";
  return "문장 다듬기";
}

function valueLabel(value: unknown): string {
  if (value === null || value === undefined) return "비어 있음";
  if (typeof value === "object" && "value" in value) return valueLabel((value as { value: unknown }).value);
  if (Array.isArray(value)) return value.map(valueLabel).join(", ") || "비어 있음";
  return String(value);
}

export function AiProposalDiff({ proposal, commandIndexes, propertyChangeIndexes, onCommandToggle, onPropertyToggle }: {
  proposal: AiEditProposal;
  commandIndexes: ReadonlySet<number>;
  propertyChangeIndexes: ReadonlySet<number>;
  onCommandToggle(index: number): void;
  onPropertyToggle(index: number): void;
}) {
  return <div className={styles.diff} aria-label="AI 제안 변경 목록">
    {proposal.commands.map((command, index) => <label key={`command-${index}`} className={styles.diffItem}>
      <input type="checkbox" checked={commandIndexes.has(index)} onChange={() => onCommandToggle(index)} />
      <span><strong>{commandLabel(command)}</strong><small>{"blockId" in command ? command.blockId : command.type === "insertBlocks" ? command.afterBlockId ?? "문서 첫 부분" : command.blockIds.join(", ")}</small></span>
    </label>)}
    {proposal.propertyChanges.map((change, index) => <label key={`property-${change.propertyId}`} className={styles.diffItem}>
      <input type="checkbox" checked={propertyChangeIndexes.has(index)} onChange={() => onPropertyToggle(index)} />
      <span><strong>속성 변경</strong><small>{valueLabel(change.previousValue)} → {valueLabel(change.nextValue)}</small></span>
    </label>)}
  </div>;
}
