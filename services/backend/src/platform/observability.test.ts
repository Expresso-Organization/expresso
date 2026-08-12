import { describe, expect, it } from "vitest";

import {
  createLoggerOptions,
  createRequestId,
  safeErrorSummary,
  sensitiveLogPaths,
} from "./observability.js";

describe("observability boundaries", () => {
  it("redacts credentials and request secrets", () => {
    const options = createLoggerOptions("info");

    expect(options.redact.censor).toBe("[REDACTED]");
    expect(sensitiveLogPaths).toEqual(
      expect.arrayContaining([
        "req.headers.authorization",
        "req.headers.cookie",
        "body.password",
        "body.accessToken",
        "databaseUrl",
        "redisUrl",
      ]),
    );
    expect(
      options.serializers!.req!({
        method: "GET",
        url: "/callback?token=secret-value",
        hostname: "localhost",
      } as never),
    ).toEqual({
      method: "GET",
      url: "/callback",
      host: "localhost",
    });
  });

  it("accepts only bounded safe external request IDs", () => {
    expect(
      createRequestId({
        headers: { "x-request-id": "req_external_1234" },
      } as never),
    ).toBe("req_external_1234");
    expect(
      createRequestId({
        headers: { "x-request-id": "bad\nrequest" },
      } as never),
    ).toMatch(/^req_[0-9a-f-]{36}$/);
  });

  it("does not copy error messages or stacks into structured summaries", () => {
    const error = Object.assign(new Error("password=secret-value"), {
      code: "ECONNREFUSED",
      statusCode: 503,
    });
    const summary = safeErrorSummary(error);

    expect(summary).toEqual({
      name: "Error",
      code: "ECONNREFUSED",
      statusCode: 503,
    });
    expect(JSON.stringify(summary)).not.toContain("secret-value");
  });
});
