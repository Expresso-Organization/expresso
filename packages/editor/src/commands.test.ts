import { describe, expect, it } from "vitest";
import { applyCareerCommands } from "./commands.js";
import { createEmptyCareerDocument } from "./document.js";

describe("career edit commands", () => {
  it("applies nested insert, replace, move, text, and delete immutably", () => {
    const document = createEmptyCareerDocument();
    const first = { id: crypto.randomUUID(), type: "paragraph", attrs: {}, text: [{ text: "first" }] };
    const second = { id: crypto.randomUUID(), type: "paragraph", attrs: {}, text: [{ text: "second" }] };
    document.content[0]!.content = [first, second];
    const inserted = { id: crypto.randomUUID(), type: "paragraph", attrs: {}, text: [{ text: "inserted" }] };
    const replacement = { id: first.id, type: "callout", attrs: { icon: "star" }, text: [{ text: "replacement" }] };
    const result = applyCareerCommands(document, [
      { type: "insertBlocks", afterBlockId: first.id, blocks: [inserted] },
      { type: "replaceBlock", blockId: first.id, block: replacement },
      { type: "moveBlock", blockId: second.id, afterBlockId: first.id },
      { type: "setText", blockId: inserted.id, text: "changed" },
      { type: "deleteBlocks", blockIds: [second.id] },
    ]);
    expect(result.content[0]!.content?.map((block) => block.type)).toEqual(["callout", "paragraph"]);
    expect(result.content[0]!.content?.[1]?.text?.[0]?.text).toBe("changed");
    expect(document.content[0]!.content?.[0]?.type).toBe("paragraph");
  });

  it("rejects the whole batch when any target is absent", () => {
    const document = createEmptyCareerDocument();
    expect(() => applyCareerCommands(document, [
      { type: "setText", blockId: document.content[0]!.id, text: "temporary" },
      { type: "deleteBlocks", blockIds: [crypto.randomUUID()] },
    ])).toThrow(/target block not found/);
    expect(document.content[0]!.text).toEqual([]);
  });
});
