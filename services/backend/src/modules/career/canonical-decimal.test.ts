import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { decimal128ToCanonicalPlain, parseCanonicalDecimal128 } from "./canonical-decimal.js";

type FixtureValue = { literal: string } | { prefix: string; repeat: string; count: number; suffix: string };
type FixtureCase = { name: string; value: FixtureValue; accepted: boolean; coefficient?: string; fractionalScale?: number };

const fixture = JSON.parse(readFileSync(
  new URL("../../../../../packages/contracts/openapi/fixtures/career-decimal128-v1.json", import.meta.url),
  "utf8",
)) as { cases: FixtureCase[] };

function valueOf(value: FixtureValue): string {
  return "literal" in value ? value.literal : `${value.prefix}${value.repeat.repeat(value.count)}${value.suffix}`;
}

function meaning(value: string): { coefficient: string; fractionalScale: number } {
  const negative = value.startsWith("-");
  const [integer = "", fraction = ""] = (negative ? value.slice(1) : value).split(".");
  const digits = `${integer}${fraction}`.replace(/^0+/, "") || "0";
  return { coefficient: digits === "0" ? "0" : `${negative ? "-" : ""}${digits}`, fractionalScale: fraction.length };
}

describe("canonical Decimal128 boundary", () => {
  it.each(fixture.cases)("matches the shared allow/reject corpus: $name", boundary => {
    const value = valueOf(boundary.value);
    if (!boundary.accepted) {
      expect(() => parseCanonicalDecimal128(value)).toThrow();
      return;
    }

    const roundTrip = decimal128ToCanonicalPlain(parseCanonicalDecimal128(value));
    expect(meaning(roundTrip)).toEqual(meaning(value));
    if (boundary.coefficient !== undefined) expect(meaning(roundTrip).coefficient).toBe(boundary.coefficient);
    if (boundary.fractionalScale !== undefined) expect(meaning(roundTrip).fractionalScale).toBe(boundary.fractionalScale);
  });
});
