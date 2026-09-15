import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { matchedTermsOf, rankMaterials } from "./ranking.js";

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

describe("matchedTermsOf", () => {
  it("적어 둔 이유에서 겹친 말을 그대로 되돌린다", () => {
    const [ranked] = rankMaterials(
      [{ id: "r1", title: "Airflow 파이프라인", status: "organized", text: "airflow 와 python 으로 적재" }],
      ["Airflow 경험", "Python 능숙"],
    );
    expect(matchedTermsOf(ranked!.reason)).toEqual(["airflow", "python"]);
    expect(matchedTermsOf("요건과 겹치는 말이 없습니다")).toEqual([]);
    expect(matchedTermsOf("요건과 겹치는 말은 없지만 검증한 기록입니다")).toEqual([]);
  });
});
