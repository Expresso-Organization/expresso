import type { ClientSession } from "mongodb";
import { describe, expect, it } from "vitest";

import { portfolioTitle } from "./portfolio-title.js";

const options = { session: {} as ClientSession };

/** 조회 경로만 흉내 낸다. 없는 단계는 null을 돌려준다. */
function collections(found: { analysis?: object | null; posting?: object | null; company?: object | null }) {
  return {
    jobAnalyses: { findOne: async () => found.analysis ?? null },
    jobPostings: { findOne: async () => found.posting ?? null },
    companies: { findOne: async () => found.company ?? null },
  } as unknown as Parameters<typeof portfolioTitle>[0];
}

describe("portfolioTitle", () => {
  it("사용자가 적은 이름을 먼저 쓴다", async () => {
    const db = collections({ analysis: { jobPostingId: "p" }, posting: { companyId: "c" }, company: { name: "쿠팡" } });
    expect(await portfolioTitle(db, "u", { jobAnalysisId: "a", freeTitle: "  내 이력  " }, options)).toBe("내 이력");
  });

  it("제작 이름이 자유 생성 제목보다 먼저다", async () => {
    expect(await portfolioTitle(collections({}), "u", { jobAnalysisId: "a", title: "제작 이름", freeTitle: "자유 제목" }, options)).toBe("제작 이름");
  });

  it("이름이 없으면 공고의 회사로 부른다", async () => {
    const db = collections({ analysis: { jobPostingId: "p" }, posting: { companyId: "c" }, company: { name: "쿠팡" } });
    expect(await portfolioTitle(db, "u", { jobAnalysisId: "a" }, options)).toBe("쿠팡 지원 포트폴리오");
  });

  it("공백뿐인 이름은 없는 것으로 본다", async () => {
    const db = collections({ analysis: { jobPostingId: "p" }, posting: { companyId: "c" }, company: { name: "당근" } });
    expect(await portfolioTitle(db, "u", { jobAnalysisId: "a", freeTitle: "   " }, options)).toBe("당근 지원 포트폴리오");
  });

  it("공고를 찾지 못하면 기본 이름이다", async () => {
    expect(await portfolioTitle(collections({ analysis: { jobPostingId: null } }), "u", { jobAnalysisId: "a" }, options)).toBe("새 포트폴리오");
    expect(await portfolioTitle(collections({}), "u", null, options)).toBe("새 포트폴리오");
  });
});
