import { describe, expect, it } from "vitest";

import { buildDependencyGraph, detectCycles } from "./dependencies.js";
import { evaluateFormula } from "./evaluator.js";
import { parseFormula } from "./parser.js";
import { typecheckFormula } from "./typecheck.js";
import type { FormulaPropertyDefinition, FormulaPropertyValue } from "./types.js";

const score = "00000000-0000-4000-8000-000000000001";
const checked = "00000000-0000-4000-8000-000000000002";
const empty = "00000000-0000-4000-8000-000000000003";
const definition = (id: string, type: string, ast?: ReturnType<typeof parseFormula>): FormulaPropertyDefinition => ({ id, type, ...(ast ? { ast } : {}) });

describe("career formula core", () => {
  it("parses precedence, stable UUID references, conditions, dates and lists", () => {
    const ast = parseFormula(`prop("${checked}") ? dateAdd(date("2026-09-01"), 2) : date("2026-09-01")`);
    expect(ast.expression.kind).toBe("conditional");
    expect(parseFormula(`prop("${score}") + 2 * 3`).expression).toMatchObject({ kind: "binary", operator: "add" });
    expect(() => parseFormula("prop(\"missing\")")).toThrow(/UUID/);
  });

  it("uses only the supplied property context and propagates null", () => {
    const context = new Map<string, FormulaPropertyValue | null>([
      [score, { type: "number", value: 5 }], [checked, { type: "checkbox", value: true }], [empty, null],
    ]);
    expect(evaluateFormula(parseFormula(`prop("${score}") + 2 * 3`), context)).toEqual({ type: "formula", value: 11, diagnostics: [] });
    expect(evaluateFormula(parseFormula(`dateAdd(date("2026-09-01"), 2)`), context)).toEqual({ type: "formula", value: "2026-09-03", diagnostics: [] });
    expect(evaluateFormula(parseFormula(`prop("${empty}") + 1`), context)).toBeNull();
    expect(evaluateFormula(parseFormula("1 + 1"), context, 1)).toBeNull();
  });

  it("reports static errors instead of evaluating unknown functions or incompatible expressions", () => {
    const schema = [definition(score, "number"), definition(checked, "checkbox")];
    expect(typecheckFormula(parseFormula("unknown(1)"), schema)[0]?.code).toBe("unknown_function");
    expect(typecheckFormula(parseFormula("1 + true"), schema)[0]?.code).toBe("invalid_operator");
    expect(typecheckFormula(parseFormula(`prop("${empty}")`), schema)[0]?.code).toBe("unknown_property");
  });

  it("enforces source and nesting limits", () => {
    expect(() => parseFormula("1".repeat(4_001))).toThrow(/4000/);
    expect(() => parseFormula(`${"(".repeat(65)}1${")".repeat(65)}`)).toThrow(/64/);
    const balanced = (items: readonly string[]): string => items.length === 1 ? items[0]! : `(${balanced(items.slice(0, Math.ceil(items.length / 2)))}+${balanced(items.slice(Math.ceil(items.length / 2)))})`;
    expect(() => parseFormula(balanced(Array.from({ length: 668 }, () => "-1")))).toThrow(/2000/);
  });

  it("builds a deterministic dependency graph and identifies cycles", () => {
    const a = "00000000-0000-4000-8000-000000000011";
    const b = "00000000-0000-4000-8000-000000000012";
    const c = "00000000-0000-4000-8000-000000000013";
    const graph = buildDependencyGraph([definition(a, "formula", parseFormula(`prop("${b}")`)), definition(b, "formula", parseFormula(`prop("${a}")`)), definition(c, "formula", parseFormula(`prop("${c}")`))]);
    expect([...graph.get(a)!]).toEqual([b]);
    expect(detectCycles(graph)).toEqual([[a, b], [c]]);
  });
});
