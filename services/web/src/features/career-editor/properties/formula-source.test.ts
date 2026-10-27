import type { CareerPropertyDefinitionV2 } from "@expresso/contracts";
import { describe, expect, it } from "vitest";

import { findPropertyReferences, formulaForDisplay, formulaForStorage, moveOffset } from "./formula-source";

const scoreId = "00000000-0000-4000-8000-000000000001";
const quotedId = "00000000-0000-4000-8000-000000000002";
const twinA = "00000000-0000-4000-8000-000000000003";
const twinB = "00000000-0000-4000-8000-000000000004";
const deletedId = "00000000-0000-4000-8000-000000000005";
function property(id: string, name: string, deletedAt: string | null = null): CareerPropertyDefinitionV2 {
  return { id, key: `p${id.slice(-1)}`, name, type: "number", required: false, system: false, config: {}, order: 0, version: 1, deletedAt };
}
const properties = [property(scoreId, "성과"), property(quotedId, "A \"B\" \\C"), property(twinA, "중복"), property(twinB, "중복"), property(deletedId, "지움", "2026-10-01T00:00:00.000Z")];

describe("formula source conversion", () => {
  it("finds prop references with spacing but skips text inside other string literals", () => {
    const source = `prop( "${scoreId}" ) + "prop(\\"x\\")" + myprop("y")`;
    expect(findPropertyReferences(source).map((reference) => reference.value)).toEqual([scoreId]);
    expect(findPropertyReferences(`prop("열린`)).toEqual([]);
  });

  it("round-trips UUIDs through names, including names with quotes and backslashes", () => {
    const stored = `prop("${scoreId}") * 2 + prop("${quotedId}")`;
    const display = formulaForDisplay(stored, properties);
    expect(display.text).toBe(`prop("성과") * 2 + prop(${JSON.stringify("A \"B\" \\C")})`);
    const back = formulaForStorage(display.text, properties);
    expect(back.diagnostics).toEqual([]);
    expect(back.text).toBe(stored);
  });

  it("keeps the UUID for deleted and ambiguous properties and reports names it cannot resolve", () => {
    const stored = `prop("${twinA}") + prop("${deletedId}")`;
    expect(formulaForDisplay(stored, properties).text).toBe(stored);
    const display = `prop("중복") + prop("없음") + prop("${twinB}")`;
    const result = formulaForStorage(display, properties);
    expect(result.text).toBe(display);
    expect(result.diagnostics.map((diagnostic) => [diagnostic.code, display.slice(diagnostic.start, diagnostic.end)])).toEqual([
      ["ambiguous_property", "\"중복\""],
      ["unknown_property", "\"없음\""],
    ]);
  });

  it("moves server offsets on the stored source back onto the displayed source", () => {
    const display = `1 + prop("성과") + x`;
    const stored = formulaForStorage(display, properties);
    const storedX = stored.text.lastIndexOf("x");
    expect(moveOffset(storedX, stored.replacements, "backward")).toBe(display.lastIndexOf("x"));
    expect(moveOffset(0, stored.replacements, "backward")).toBe(0);
    const argument = stored.text.indexOf(scoreId);
    expect(moveOffset(argument, stored.replacements, "backward")).toBe(display.indexOf("\"성과\"") + "\"성과\"".length);
    expect(moveOffset(display.lastIndexOf("x"), stored.replacements)).toBe(storedX);
  });
});
