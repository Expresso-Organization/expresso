import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { evaluateFormula } from "./evaluator.js";
import { parseFormula } from "./parser.js";
import { typecheckFormula } from "./typecheck.js";
import type { FormulaPropertyDefinition, FormulaPropertyValue } from "./types.js";

interface Case { source: string; result?: string | number | boolean | null; diagnostic?: string; parseError?: boolean }
const fixture = JSON.parse(readFileSync(new URL("../__fixtures__/synapsenote-formula-conformance.json", import.meta.url), "utf8")) as Case[];
const schema: FormulaPropertyDefinition[] = [
  { id: "00000000-0000-4000-8000-000000000001", type: "number" },
  { id: "00000000-0000-4000-8000-000000000002", type: "checkbox" },
  { id: "00000000-0000-4000-8000-000000000003", type: "number" },
];
const context = new Map<string, FormulaPropertyValue | null>([
  [schema[0]!.id, { type: "number", value: 5 }], [schema[1]!.id, { type: "checkbox", value: true }], [schema[2]!.id, null],
]);

describe("formula conformance fixture", () => {
  for (const item of fixture) it(item.source, () => {
    if (item.parseError) { expect(() => parseFormula(item.source)).toThrow(); return; }
    const ast = parseFormula(item.source);
    if (item.diagnostic) { expect(typecheckFormula(ast, schema).map((diagnostic) => diagnostic.code)).toContain(item.diagnostic); return; }
    const result = evaluateFormula(ast, context);
    expect(result?.value ?? null).toEqual(item.result);
  });
});
