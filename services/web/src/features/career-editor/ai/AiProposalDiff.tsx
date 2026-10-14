"use client";

import { CareerBusinessPropertyValueSchema, type AiEditProposal, type CareerPropertyDefinitionV2 } from "@expresso/contracts";
import type { CareerBlock, CareerDocument } from "@expresso/editor";

import styles from "./ai.module.css";
import { canonicalDisplayValue } from "../properties/canonical-values";

function findBlock(blocks: readonly CareerBlock[], id: string): CareerBlock | null {
  for (const block of blocks) {
    if (block.id === id) return block;
    if (block.content) { const nested = findBlock(block.content, id); if (nested) return nested; }
  }
  return null;
}

function blockText(block: CareerBlock | null | undefined): string {
  if (!block) return "선택한 블록";
  const own = block.text?.map((span) => span.text).join("") ?? "";
  const nested = block.content?.map((item) => blockText(item)).join(" ") ?? "";
  return (own || nested || block.type).replace(/\s+/g, " ").trim().slice(0, 180);
}

function valueLabel(value: unknown, definition?: CareerPropertyDefinitionV2): string {
  const canonical = CareerBusinessPropertyValueSchema.safeParse(value);
  if (canonical.success && definition) return canonicalDisplayValue(definition, canonical.data);
  if (value === null || value === undefined) return "비어 있음";
  if (typeof value === "object" && "value" in value) return valueLabel((value as { value: unknown }).value);
  if (Array.isArray(value)) return value.map(item => valueLabel(item)).join(", ") || "비어 있음";
  if (typeof value === "object" && "start" in value) {
    const range = value as { start: unknown; end?: unknown; timezone?: unknown };
    if (typeof range.timezone === "string") return String(range.start) + (range.end ? " – " + String(range.end) : "") + " (" + range.timezone + ")";
    return `${String(range.start)}${range.end ? ` – ${String(range.end)}` : ""}`;
  }
  return String(value);
}

function ChangeRow({ checked, tone, label, before, after, detail, onToggle }: {
  checked: boolean;
  tone: "add" | "remove" | "change" | "move";
  label: string;
  before?: string;
  after?: string;
  detail?: string;
  onToggle(): void;
}) {
  const mark = tone === "add" ? "+" : tone === "remove" ? "−" : tone === "move" ? "↕" : "~";
  return <label className={styles.diffItem} data-tone={tone}>
    <input type="checkbox" checked={checked} onChange={onToggle} />
    <span className={styles.diffMark} aria-hidden="true">{mark}</span>
    <span className={styles.diffCopy}>
      <strong>{label}</strong>
      {before !== undefined || after !== undefined ? <span className={styles.diffValues}>{before !== undefined ? <del>{before}</del> : null}{after !== undefined ? <ins>{after}</ins> : null}</span> : <small>{detail}</small>}
    </span>
  </label>;
}

export function AiProposalDiff({ proposal, document, definitions, commandIndexes, propertyChangeIndexes, onCommandToggle, onPropertyToggle }: {
  proposal: AiEditProposal;
  document?: CareerDocument | null;
  definitions?: readonly CareerPropertyDefinitionV2[];
  commandIndexes: ReadonlySet<number>;
  propertyChangeIndexes: ReadonlySet<number>;
  onCommandToggle(index: number): void;
  onPropertyToggle(index: number): void;
}) {
  const blocks = document?.content ?? [];
  const definitionById = new Map((definitions ?? []).map(definition => [definition.id, definition]));
  return <div className={styles.diff} aria-label="AI 제안 변경 목록">
    {proposal.commands.map((command, index) => {
      if (command.type === "insertBlocks") return <ChangeRow key={`command-${index}`} checked={commandIndexes.has(index)} tone="add" label={`블록 ${command.blocks.length}개 추가`} after={command.blocks.map((block) => blockText(block)).join(" · ")} onToggle={() => onCommandToggle(index)} />;
      if (command.type === "replaceBlock") return <ChangeRow key={`command-${index}`} checked={commandIndexes.has(index)} tone="change" label="블록 내용 교체" before={blockText(findBlock(blocks, command.blockId))} after={blockText(command.block)} onToggle={() => onCommandToggle(index)} />;
      if (command.type === "deleteBlocks") return <ChangeRow key={`command-${index}`} checked={commandIndexes.has(index)} tone="remove" label={`블록 ${command.blockIds.length}개 삭제`} before={command.blockIds.map((id) => blockText(findBlock(blocks, id))).join(" · ")} onToggle={() => onCommandToggle(index)} />;
      if (command.type === "moveBlock") return <ChangeRow key={`command-${index}`} checked={commandIndexes.has(index)} tone="move" label="블록 위치 이동" detail={blockText(findBlock(blocks, command.blockId))} onToggle={() => onCommandToggle(index)} />;
      return <ChangeRow key={`command-${index}`} checked={commandIndexes.has(index)} tone="change" label="문장 수정" before={blockText(findBlock(blocks, command.blockId))} after={command.text} onToggle={() => onCommandToggle(index)} />;
    })}
    {proposal.propertyChanges.map((change, index) => {
      const before = change.canonicalPreviousValue !== undefined ? change.canonicalPreviousValue : "previousValue" in change ? change.previousValue : null;
      const after = change.canonicalNextValue !== undefined ? change.canonicalNextValue : "nextValue" in change ? change.nextValue : null;
      const definition = definitionById.get(change.propertyId);
      return <ChangeRow key={"property-" + change.propertyId} checked={propertyChangeIndexes.has(index)}
        tone={before === null ? "add" : after === null ? "remove" : "change"} label={(definition?.name ?? "속성") + " 변경"}
        before={valueLabel(before, definition)} after={valueLabel(after, definition)} onToggle={() => onPropertyToggle(index)} />;
    })}
  </div>;
}
