import type { GenerationOutput } from "@expresso/contracts";
import type { BlockDoc, JsonObject, PortfolioSectionDoc } from "@expresso/database";

/** 생성 계약의 블록을 저장 문서의 공통 content 모양으로 바꿉니다. */
export function mongoBlockContent(block: GenerationOutput["blocks"][number]): JsonObject {
  if (block.kind === "list") {
    return { items: block.items ?? block.text.split("\n").map((line) => line.trim()).filter(Boolean) };
  }
  if (block.kind === "metric") return { value: block.text, label: block.label ?? "" };
  if (block.kind === "chart" && block.chart) return block.chart as unknown as JsonObject;
  return block.runs
    ? { text: block.text, runs: block.runs as unknown as JsonObject["runs"] }
    : { text: block.text };
}

export function mongoPortfolioSnapshot(
  portfolioId: string,
  sections: readonly PortfolioSectionDoc[],
  blocks: readonly BlockDoc[],
): JsonObject {
  return {
    portfolioId,
    sections: sections.map((section) => ({
      id: section._id,
      recipeSectionId: section.recipeSectionId ?? null,
      order: section.orderNo,
      visible: section.visible,
      blocks: blocks.filter((block) => block.portfolioSectionId === section._id).map((block) => ({
        id: block._id, kind: block.kind, content: block.content, style: block.style,
        sourceRecordId: block.sourceRecordId ?? null, syncState: block.syncState, locked: block.locked,
      })),
    })),
  } as unknown as JsonObject;
}
