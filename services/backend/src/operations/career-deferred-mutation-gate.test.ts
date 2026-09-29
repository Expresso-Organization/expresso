import { describe, expect, it } from "vitest";

import { checkCareerDeferredMutationDrain } from "./career-deferred-mutation-gate.js";

describe("Career deferred mutation rollout gate", () => {
  it("passes when Mongo outbox and both BullMQ queues have no deferred property mutation", async () => {
    const result = await checkCareerDeferredMutationDrain({
      listOutboxEvents: async () => [],
      listQueueJobs: async () => [],
      listDeadLetterJobs: async () => [],
    });

    expect(result).toEqual({ safe: true, risks: [] });
  });

  it("fails closed for resumable Mongo and BullMQ deferred property mutations", async () => {
    const result = await checkCareerDeferredMutationDrain({
      listOutboxEvents: async () => [
        { id: "outbox-pending", topic: "career.property-conversion", state: "pending" },
        { id: "outbox-dead", topic: "career.property-restoration", state: "dead_letter" },
        { id: "unrelated", topic: "career.computation", state: "pending" },
      ],
      listQueueJobs: async () => [
        { id: "job-active", topic: "career.property-deletion", state: "active" },
        { id: "job-failed", topic: "career.property-default", state: "failed" },
        { id: "job-unrelated", topic: "portfolio.generate", state: "waiting" },
      ],
      listDeadLetterJobs: async () => [
        { id: "dlq-1", topic: "career.property-conversion", state: "dead_letter" },
      ],
    });

    expect(result.safe).toBe(false);
    expect(result.risks).toEqual([
      { source: "mongo_outbox", id: "outbox-pending", topic: "career.property-conversion", state: "pending" },
      { source: "mongo_outbox", id: "outbox-dead", topic: "career.property-restoration", state: "dead_letter" },
      { source: "bullmq", id: "job-active", topic: "career.property-deletion", state: "active" },
      { source: "bullmq", id: "job-failed", topic: "career.property-default", state: "failed" },
      { source: "bullmq_dead_letter", id: "dlq-1", topic: "career.property-conversion", state: "dead_letter" },
    ]);
  });
});
