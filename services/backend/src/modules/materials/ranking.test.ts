import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { rankMaterials } from "./ranking.js";

describe("material ranking", () => {
  it("ranks requirement matches deterministically with a verified tie-break bonus", () => {
    const matchedId = randomUUID();
    const verifiedId = randomUUID();
    const ranked = rankMaterials([
      {
        id: verifiedId,
        title: "Verified unrelated",
        status: "verified",
        text: "Visual identity systems",
      },
      {
        id: matchedId,
        title: "Backend evidence",
        status: "organized",
        text: "TypeScript PostgreSQL backend reliability",
      },
    ], ["TypeScript PostgreSQL backend"]);

    expect(ranked.map(({ id }) => id)).toEqual([matchedId, verifiedId]);
    expect(ranked[0]?.score).toBeGreaterThan(ranked[1]?.score ?? 0);
    expect(ranked[0]?.reason).toContain("typescript");
  });
});
