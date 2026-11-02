import { z } from "zod";
import { afterEach, describe, expect, it, vi } from "vitest";
import { requestWithPendingOperation } from "./client";
const id = "00000000-0000-4000-8000-000000000001";
const operation = { operationId: id, producer: "interview", state: "pending", recordId: null, owners: { business: "pending", document: "pending" }, statusUrl: "/v1/career/write-operations/" + id, retryable: true, updatedAt: "2026-10-09T00:00:00Z" };
afterEach(() => vi.unstubAllGlobals());
describe("API pending operation parsing", () => {
  it("parses actual 202 separately and preserves successful 200 contracts", async () => {
    const schema = z.strictObject({ data: z.strictObject({ answer: z.string() }) });
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ data: operation }, { status: 202 })));
    expect(await requestWithPendingOperation("/v1/interview", schema, {}, "interview")).toEqual({ data: operation });
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ data: { answer: "saved" } })));
    expect(await requestWithPendingOperation("/v1/interview", schema, {}, "interview")).toEqual({ data: { answer: "saved" } });
  });
});