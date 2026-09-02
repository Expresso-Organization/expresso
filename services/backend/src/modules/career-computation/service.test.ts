import { describe, expect, it } from "vitest";

import { createCareerComputationProcessor } from "../../worker/processors/career-computation.js";

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
});
