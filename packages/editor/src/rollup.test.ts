import { describe, expect, it } from "vitest";

import { aggregateRollup, type CareerRollupAggregation } from "./rollup.js";
import type { FormulaPropertyValue } from "./formula/types.js";

const number = (value: number): FormulaPropertyValue => ({ type: "number", value });
const checked = (value: boolean): FormulaPropertyValue => ({ type: "checkbox", value });
const date = (start: string): FormulaPropertyValue => ({ type: "date", value: { start, end: null, timezone: null } });

describe("career rollup", () => {
  it("supports every aggregation and skips null deleted targets", () => {
    const values = [number(2), number(2), number(8), null] as const;
    const expected: Readonly<Record<CareerRollupAggregation, unknown>> = {
      count: 3, unique_count: 2, sum: 12, average: 4, min: 2, max: 8,
      earliest: "2026-01-01", latest: "2026-03-01", percent_checked: 50, show_unique: [2, 8],
    };
    for (const kind of ["count", "unique_count", "sum", "average", "min", "max", "show_unique"] as const) expect(aggregateRollup(kind, values)?.value).toEqual(expected[kind]);
    expect(aggregateRollup("earliest", [date("2026-03-01"), null, date("2026-01-01")])?.value).toBe(expected.earliest);
    expect(aggregateRollup("latest", [date("2026-03-01"), null, date("2026-01-01")])?.value).toBe(expected.latest);
    expect(aggregateRollup("percent_checked", [checked(true), null, checked(false)])?.value).toBe(expected.percent_checked);
  });

  it("returns a null computed result for incompatible or empty inputs", () => {
    expect(aggregateRollup("count", [])?.value).toBe(0);
    expect(aggregateRollup("unique_count", [])?.value).toBe(0);
    expect(aggregateRollup("show_unique", [])?.value).toEqual([]);
    expect(aggregateRollup("sum", [])?.value).toBeNull();
    expect(aggregateRollup("sum", [number(1), { type: "text", value: "no" }])?.value).toBeNull();
    expect(aggregateRollup("average", [])?.value).toBeNull();
    expect(aggregateRollup("min", [])?.value).toBeNull();
    expect(aggregateRollup("max", [])?.value).toBeNull();
    expect(aggregateRollup("earliest", [number(1)])?.value).toBeNull();
    expect(aggregateRollup("latest", [])?.value).toBeNull();
    expect(aggregateRollup("percent_checked", [null])?.value).toBeNull();
  });
});
