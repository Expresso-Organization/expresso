import { describe, expect, it } from "vitest";

import { inspectReadiness } from "./readiness.js";

describe("inspectReadiness", () => {
  it("reports ready when every dependency is healthy", async () => {
    const result = await inspectReadiness([
      { name: "postgres", run: async () => undefined },
      { name: "redis", run: async () => undefined },
    ]);

    expect(result).toEqual({
      status: "ready",
      checks: { postgres: "up", redis: "up" },
    });
  });

  it("does not expose dependency errors", async () => {
    const result = await inspectReadiness([
      {
        name: "postgres",
        run: async () => {
          throw new Error("password=secret");
        },
      },
    ]);

    expect(result).toEqual({
      status: "not_ready",
      checks: { postgres: "down" },
    });
    expect(JSON.stringify(result)).not.toContain("secret");
  });
});

