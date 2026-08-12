import type { EntitlementCapability, PlanCode } from "@expresso/contracts";
import { describe, expect, it } from "vitest";

import { capabilityEnabled, kstMonthlyPeriod } from "./service.js";

describe("entitlement matrix", () => {
  const expected: Record<
    PlanCode,
    Record<"portfolio.generate" | "export.document" | "analysis.advanced", boolean>
  > = {
    free: {
      "portfolio.generate": true,
      "export.document": false,
      "analysis.advanced": false,
    },
    pro: {
      "portfolio.generate": true,
      "export.document": true,
      "analysis.advanced": false,
    },
    team: {
      "portfolio.generate": true,
      "export.document": true,
      "analysis.advanced": true,
    },
  };

  it("applies the documented generation, export, and analysis matrix", () => {
    for (const planCode of ["free", "pro", "team"] as const) {
      for (const capability of Object.keys(expected[planCode]) as EntitlementCapability[]) {
        expect(capabilityEnabled(planCode, {}, capability)).toBe(
          expected[planCode][capability as keyof typeof expected[typeof planCode]],
        );
      }
    }
  });

  it("allows a plan feature flag to override its default without code changes", () => {
    expect(
      capabilityEnabled("pro", { "export.document": false }, "export.document"),
    ).toBe(false);
    expect(
      capabilityEnabled("free", { "analysis.advanced": true }, "analysis.advanced"),
    ).toBe(true);
  });
});

describe("KST monthly quota period", () => {
  it("resets exactly at the first day of the month in UTC+9", () => {
    expect(kstMonthlyPeriod(new Date("2026-08-31T14:59:59.999Z"))).toEqual({
      periodStart: "2026-08-01",
      resetsAt: "2026-08-31T15:00:00.000Z",
    });
    expect(kstMonthlyPeriod(new Date("2026-08-31T15:00:00.000Z"))).toEqual({
      periodStart: "2026-09-01",
      resetsAt: "2026-09-30T15:00:00.000Z",
    });
  });
});
