import { describe, expect, it } from "vitest";
import type { CareerCategoryDoc, CareerRecordDoc } from "@expresso/database";

import { createCareerComputationProcessor } from "../../worker/processors/career-computation.js";
import {
  computationFanoutKey,
  computationFreshKey,
  computationWriteFilter,
  computationWriteUpdate,
  resolveComputationValue,
} from "./service.js";

describe("career computation processor", () => {
  it("passes the BullMQ job ID through as the durable computation event ID", async () => {
    const events: unknown[] = [];
    const processor = createCareerComputationProcessor({
      async recompute(event) { events.push(event); return "applied" as const; },
      async previewFormula() { throw new Error("not used"); },
      async previewRollup() { throw new Error("not used"); },
    });
    await expect(processor({ id: "job-1", data: { userId: "user", recordId: "record", changedPropertyIds: ["property"], sourceRecordVersion: 1 } } as never)).resolves.toBe("applied");
    expect(events).toEqual([{ eventId: "job-1", userId: "user", recordId: "record", changedPropertyIds: ["property"], sourceRecordVersion: 1 }]);
  });

  it("uses an intentional empty canonical snapshot without falling back to legacy properties", () => {
    expect(resolveComputationValue(category(), record({ propertyValues: [] }), PROPERTY_ID, {})).toBeNull();
  });

  it("uses canonical values by propertyDefinitionId before legacy key values", () => {
    expect(resolveComputationValue(category(), record({
      propertyValues: [{ propertyDefinitionId: PROPERTY_ID, type: "text", value: "canonical" }],
    }), PROPERTY_ID, {})).toEqual({ type: "text", value: "canonical" });
  });

  it("falls back to legacy properties only when the canonical field is absent", () => {
    expect(resolveComputationValue(category(), record({}), PROPERTY_ID, {}))
      .toEqual({ type: "text", value: "legacy" });
  });

  it("rejects malformed canonical values instead of hiding them with legacy data", () => {
    expect(() => resolveComputationValue(category(), record({
      propertyValues: [{ propertyDefinitionId: PROPERTY_ID, type: "checkbox", value: true }],
    } as never), PROPERTY_ID, {})).toThrow(/canonical/);
  });

  it("builds a computation-only CAS update and treats a missing computationVersion as zero", () => {
    expect(computationWriteFilter(record({}), 7)).toEqual({
      _id: RECORD_ID, userId: USER_ID, deletedAt: null, version: 7,
      $or: [{ computationVersion: 0 }, { computationVersion: { $exists: false } }],
    });
    expect(computationWriteFilter(record({ computationVersion: 3 }), 7)).toEqual({
      _id: RECORD_ID, userId: USER_ID, deletedAt: null, version: 7, computationVersion: 3,
    });
    const computedAt = new Date("2026-09-14T00:00:00Z");
    expect(computationWriteUpdate({ result: { type: "formula", value: 2 } }, computedAt)).toEqual({
      $set: { computedProperties: { result: { type: "formula", value: 2 } }, computedAt },
      $inc: { computationVersion: 1 },
    });
  });

  it("includes the computation generation in fresh and fanout idempotency keys", () => {
    expect(computationFreshKey(RECORD_ID, 7, 3)).toBe(`career-computation-fresh:${RECORD_ID}:v7:c3`);
    expect(computationFanoutKey(RECORD_ID, "source", 7, 3))
      .toBe(`career-computation-fanout:${RECORD_ID}:source:v7:c3`);
  });
});

const USER_ID = "bc2f9791-0bb1-4a31-a23d-ea720f31284d";
const RECORD_ID = "10ecce84-8d6b-4b76-87de-ec76729f9b90";
const CATEGORY_ID = "475106fc-bf88-4a73-9c27-66c648733936";
const PROPERTY_ID = "6c663539-48c1-5d12-939d-f100fac993c1";
const LEGACY_PROPERTY_ID = "1c768bad-5906-56d3-a7fd-09b48c017780";

function category(): CareerCategoryDoc {
  return {
    _id: CATEGORY_ID, key: "experience", isSystem: true, sortOrder: 0, name: "경험",
    icon: "briefcase", defaultView: "table", version: 1, updatedAt: new Date(),
    propertySchema: { role: { id: LEGACY_PROPERTY_ID, label: "역할", type: "text", required: false, system: true } },
    propertyDefinitions: [{ id: PROPERTY_ID, key: "role", name: "역할", type: "text", required: false,
      system: true, config: {}, order: 0, version: 1, deletedAt: null }],
  };
}

function record(extra: Partial<CareerRecordDoc>): CareerRecordDoc {
  return {
    _id: RECORD_ID, userId: USER_ID, categoryId: CATEGORY_ID, title: "", status: "draft",
    origin: "manual", properties: { role: { type: "text", value: "legacy" } }, bodyMd: "",
    version: 7, updatedAt: new Date(), ...extra,
  };
}
