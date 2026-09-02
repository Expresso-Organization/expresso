import { z } from "zod";
import { CareerBlockSchema, CareerDocumentSchema, type CareerBlock, type CareerDocument } from "./document.js";

export const CareerEditCommandSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("insertBlocks"), afterBlockId: z.uuid().nullable(), blocks: z.array(CareerBlockSchema).min(1) }),
  z.strictObject({ type: z.literal("replaceBlock"), blockId: z.uuid(), block: CareerBlockSchema }),
  z.strictObject({ type: z.literal("deleteBlocks"), blockIds: z.array(z.uuid()).min(1) }),
  z.strictObject({ type: z.literal("moveBlock"), blockId: z.uuid(), afterBlockId: z.uuid().nullable() }),
  z.strictObject({ type: z.literal("setText"), blockId: z.uuid(), text: z.string().max(50_000) }),
]);
export type CareerEditCommand = z.infer<typeof CareerEditCommandSchema>;

interface BlockLocation { parent: CareerBlock[]; index: number }
function locate(blocks: CareerBlock[], id: string): BlockLocation | undefined {
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    if (!block) continue;
    if (block.id === id) return { parent: blocks, index };
    if (block.content) { const nested = locate(block.content, id); if (nested) return nested; }
  }
  return undefined;
}
function allIds(blocks: CareerBlock[]): string[] {
  return blocks.flatMap((block) => [block.id, ...(block.content ? allIds(block.content) : [])]);
}

export function applyCareerCommands(document: CareerDocument, commands: readonly CareerEditCommand[]): CareerDocument {
  const parsed = commands.map((command) => CareerEditCommandSchema.parse(command));
  const next = structuredClone(document);
  for (const command of parsed) {
    if (command.type === "insertBlocks") {
      const target = command.afterBlockId ? locate(next.content, command.afterBlockId) : undefined;
      if (command.afterBlockId && !target) throw new Error("target block not found");
      const known = new Set(allIds(next.content));
      if (allIds(command.blocks).some((id) => known.has(id))) throw new Error("duplicate block id");
      const parent = target?.parent ?? next.content;
      parent.splice(target ? target.index + 1 : 0, 0, ...structuredClone(command.blocks));
    } else if (command.type === "replaceBlock") {
      const target = locate(next.content, command.blockId);
      if (!target) throw new Error("target block not found");
      target.parent[target.index] = structuredClone(command.block);
    } else if (command.type === "deleteBlocks") {
      if (command.blockIds.some((id) => !locate(next.content, id))) throw new Error("target block not found");
      for (const id of command.blockIds) { const target = locate(next.content, id); if (target) target.parent.splice(target.index, 1); }
    } else if (command.type === "moveBlock") {
      const source = locate(next.content, command.blockId);
      if (!source) throw new Error("target block not found");
      const [block] = source.parent.splice(source.index, 1);
      if (!block) throw new Error("target block not found");
      const target = command.afterBlockId ? locate(next.content, command.afterBlockId) : undefined;
      if (command.afterBlockId && !target) throw new Error("target block not found");
      const parent = target?.parent ?? next.content;
      parent.splice(target ? target.index + 1 : 0, 0, block);
    } else {
      const target = locate(next.content, command.blockId);
      if (!target) throw new Error("target block not found");
      const block = target.parent[target.index];
      if (!block) throw new Error("target block not found");
      block.text = [{ text: command.text }];
    }
  }
  return CareerDocumentSchema.parse(next);
}
