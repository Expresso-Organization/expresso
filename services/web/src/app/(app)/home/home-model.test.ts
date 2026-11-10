import type { CareerProfile, JobPostingMatch, PortfolioSummary } from "@expresso/contracts";
import { describe, expect, it } from "vitest";

import {
  type ActiveBrew,
  biggestDrop,
  dailySeries,
  exampleQueries,
  allJobsQuery,
  gridItems,
  jobsTabShown,
  mergeReferrers,
  missingRequirements,
  roleTab,
  type SiteInsight,
} from "./home-model";

const profile = (targetRoles: CareerProfile["targetRoles"], experienceYears = 3): CareerProfile => ({
  targetRoles,
  experienceYears,
  primaryGoal: "build",
  updatedAt: "2026-11-01T00:00:00.000Z",
});

describe("roleTab", () => {
  it("공고 직군으로 바꿀 수 있는 첫 목표 직군을 쓴다", () => {
    expect(roleTab(profile(["디자인", "프론트엔드"]))).toEqual({ label: "프론트엔드", family: "프론트엔드" });
  });

  it("DevOps는 공고의 「인프라 · 플랫폼」으로 찾는다", () => {
    expect(roleTab(profile(["DevOps"]))).toEqual({ label: "DevOps", family: "인프라 · 플랫폼" });
  });

  it("프로필이 없거나 대응하는 직군이 없으면 전체 공고다", () => {
    expect(roleTab(null)).toEqual({ label: "전체 공고", family: null });
    expect(roleTab(profile(["기획 · PM"]))).toEqual({ label: "전체 공고", family: null });
  });
});

describe("jobsTabShown", () => {
  it("관심 공고가 있으면 요청한 탭을 보인다", () => {
    expect(jobsTabShown("interested", 2)).toBe("interested");
    expect(jobsTabShown("role", 2)).toBe("role");
  });

  it("관심 공고가 없으면 관심 탭을 요청해도 첫 탭이다", () => {
    expect(jobsTabShown("interested", 0)).toBe("role");
  });
});

describe("allJobsQuery", () => {
  it("관심 탭은 관심 공고 목록으로 간다", () => {
    expect(allJobsQuery("interested", "프론트엔드")).toEqual({ interested: "true" });
  });

  it("첫 탭은 목표 직군으로, 직군이 없으면 조건 없이 간다", () => {
    expect(allJobsQuery("role", "프론트엔드")).toEqual({ family: "프론트엔드" });
    expect(allJobsQuery("role", null)).toEqual({});
  });
});

describe("exampleQueries", () => {
  it("목표 직군과 경력으로 만든다", () => {
    expect(exampleQueries(profile(["프론트엔드"], 3))).toEqual(["경력 3년 프론트엔드", "서울 프론트엔드", "리모트 프론트엔드"]);
    expect(exampleQueries(profile(["백엔드"], 0))[0]).toBe("신입 백엔드");
  });

  it("목표 직군이 없으면 비운다", () => {
    expect(exampleQueries(null)).toEqual([]);
    expect(exampleQueries(profile(["디자인"]))).toEqual([]);
  });
});

describe("missingRequirements", () => {
  const axis = (missing: string[]) => ({ required: missing.length + 1, covered: 1, matched: ["x"], missing });
  it("기술 · 역할 · 성과 · 조건 순서로 앞에서 자른다", () => {
    const match: JobPostingMatch = {
      total: 71, covered: 5, required: 7,
      axes: { technology: axis(["GraphQL"]), role: axis([]), impact: axis(["A/B 테스트"]), conditions: axis(["서울"]) },
    } as JobPostingMatch;
    expect(missingRequirements(match)).toEqual(["GraphQL", "A/B 테스트"]);
  });
});

describe("gridItems", () => {
  const brew = (id: string, updatedAt: string): ActiveBrew => ({ id, status: "draft", updatedAt, title: null, company: null });
  const portfolio = (id: string, brewId: string, updatedAt: string) => ({ id, brewId, updatedAt }) as PortfolioSummary;

  it("제작과 포트폴리오를 마지막 작업 순으로 섞어 자른다", () => {
    const items = gridItems(
      [brew("b1", "2026-11-01T00:00:00Z"), brew("b2", "2026-10-20T00:00:00Z")],
      [portfolio("p1", "bx", "2026-10-25T00:00:00Z")],
      2,
    );
    expect(items.map((item) => (item.kind === "brew" ? item.brew.id : item.portfolio.id))).toEqual(["b1", "p1"]);
  });

  it("이미 포트폴리오가 된 제작은 칸을 따로 세우지 않는다", () => {
    const items = gridItems([brew("b1", "2026-11-01T00:00:00Z")], [portfolio("p1", "b1", "2026-10-25T00:00:00Z")], 5);
    expect(items.map((item) => item.kind)).toEqual(["portfolio"]);
  });
});

describe("dailySeries", () => {
  it("집계가 없던 날도 0으로 채워 기간의 모든 날을 낸다", () => {
    const days = dailySeries("2026-10-30", "2026-11-01", [
      { date: "2026-10-31", visits: 4, completes: 1, contactClicks: 1, fileDownloads: 0, linkClicks: 0 },
    ]);
    expect(days).toEqual([
      { date: "2026-10-30", visits: 0, contactClicks: 0 },
      { date: "2026-10-31", visits: 4, contactClicks: 1 },
      { date: "2026-11-01", visits: 0, contactClicks: 0 },
    ]);
  });
});

describe("mergeReferrers", () => {
  it("사이트들의 유입 경로를 출처마다 더해 많은 순서로", () => {
    const site = (referrers: SiteInsight["referrers"]) => ({ referrers }) as SiteInsight;
    expect(mergeReferrers([
      site([{ origin: null, visits: 3 }, { origin: "https://www.linkedin.com", visits: 2 }]),
      site([{ origin: "https://www.linkedin.com", visits: 5 }]),
    ])).toEqual([
      { origin: "https://www.linkedin.com", visits: 7 },
      { origin: null, visits: 3 },
    ]);
  });
});

describe("biggestDrop", () => {
  it("앞 섹션보다 가장 많이 줄어든 자리를 고른다", () => {
    expect(biggestDrop(128, [128, 121, 104, 61, 52, 44])).toBe(3);
  });

  it("첫 섹션은 방문 수와 견주고, 줄어든 곳이 없으면 -1", () => {
    expect(biggestDrop(100, [40, 38])).toBe(0);
    expect(biggestDrop(10, [10, 10])).toBe(-1);
  });
});
