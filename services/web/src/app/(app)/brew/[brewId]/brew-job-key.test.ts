import { IdempotencyKeySchema } from "@expresso/contracts";
import { describe, expect, it } from "vitest";

import { brewJobKey } from "./brew-job-key";

const brewId = "3b2f0f8e-1c4d-4a6b-9e7f-0a1b2c3d4e5f";
const jobId = "8f0c4a52-6a43-4b9e-9d2a-1f7a0c2b3e41";

describe("brewJobKey", () => {
  it("keeps the original key when the page has not seen a job", () => {
    expect(brewJobKey("recipe", brewId, null)).toBe(`recipe:${brewId}`);
    expect(brewJobKey("interview", brewId, "")).toBe(`interview:${brewId}`);
  });

  it("appends the last job the page saw so the next press starts a new job", () => {
    expect(brewJobKey("recipe", brewId, jobId)).toBe(`recipe:${brewId}:${jobId}`);
  });

  it("ignores a basis that is not a job ID", () => {
    expect(brewJobKey("recipe", brewId, "../../etc")).toBe(`recipe:${brewId}`);
    expect(brewJobKey("recipe", brewId, new File([], "x"))).toBe(`recipe:${brewId}`);
  });

  it("fits the idempotency key contract", () => {
    expect(IdempotencyKeySchema.safeParse(brewJobKey("interview", brewId, jobId)).success).toBe(true);
    expect(IdempotencyKeySchema.safeParse(brewJobKey("recipe", brewId, null)).success).toBe(true);
  });
});
