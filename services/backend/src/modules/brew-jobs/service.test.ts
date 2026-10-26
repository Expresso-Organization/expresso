import { describe, expect, it } from "vitest";

import { brewJobOutboxKey } from "./service.js";

const id = "8f0c4a52-6a43-4b9e-9d2a-1f7a0c2b3e41";

describe("brewJobOutboxKey", () => {
  it("keeps the first submission on the original outbox key", () => {
    expect(brewJobOutboxKey({ _id: id, status: "queued", attempts: 0, failureRetryable: null }, true)).toBe(`brew-job:${id}`);
  });

  it("publishes a retryable failure again under a key numbered by attempts", () => {
    expect(brewJobOutboxKey({ _id: id, status: "failed", attempts: 5, failureRetryable: true }, false)).toBe(`brew-job:${id}:5`);
    expect(brewJobOutboxKey({ _id: id, status: "failed", attempts: 6, failureRetryable: true }, false)).toBe(`brew-job:${id}:6`);
  });

  it("replays non-retryable failures, successes, and jobs still in flight without publishing", () => {
    expect(brewJobOutboxKey({ _id: id, status: "failed", attempts: 1, failureRetryable: false }, false)).toBeNull();
    expect(brewJobOutboxKey({ _id: id, status: "failed", attempts: 1, failureRetryable: null }, false)).toBeNull();
    expect(brewJobOutboxKey({ _id: id, status: "succeeded", attempts: 1, failureRetryable: null }, false)).toBeNull();
    expect(brewJobOutboxKey({ _id: id, status: "queued", attempts: 0, failureRetryable: null }, false)).toBeNull();
    expect(brewJobOutboxKey({ _id: id, status: "running", attempts: 1, failureRetryable: null }, false)).toBeNull();
  });
});
