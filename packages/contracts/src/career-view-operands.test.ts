import { describe, expect, it } from "vitest";
import { CareerViewFilterV2Schema } from "./career-views.js";

const propertyId = "00000000-0000-4000-8000-000000000001";
describe("precise canonical Career view operands", () => {
  it("accepts exact canonical number and date envelopes alongside saved legacy operands", () => {
    for (const operand of [
      { type: "number", value: "9007199254740993123456789012345678" },
      { type: "date", value: { precision: "month", start: "2026-09", end: null } },
      { type: "date", value: { precision: "datetime", start: "2026-09-01T12:30:00.123456789+09:00", end: null, timezone: "Asia/Seoul" } },
      { type: "number", value: 2 },
      { type: "date", value: { start: "2026-09-01", end: null, timezone: null } },
    ]) expect(CareerViewFilterV2Schema.parse({ propertyId, operator: "gte", operand })).toEqual({ propertyId, operator: "gte", operand });
    expect(CareerViewFilterV2Schema.safeParse({ propertyId, operator: "eq", operand: { type: "number", value: "1".repeat(35) } }).success).toBe(false);
  });
});