import { describe, expect, it } from "vitest";
import type { Activity, JobPostingSummary } from "@expresso/contracts";
import { activityItem, activityMatches, jobItem } from "./finds.js";

const job = (overrides: Partial<JobPostingSummary> = {}) => ({ id: "00000000-0000-4000-8000-000000000001", title: "백엔드 엔지니어", company: { name: "당근" }, location: "서울 강남", experienceLabel: "신입 가능", workType: null, family: "백엔드", daysLeft: 12, ...overrides }) as JobPostingSummary;
// 줄로 옮길 때 읽는 칸만 채운다. 활동의 칸은 수집 출처가 늘면 함께 는다.
const activity = (overrides: Partial<Activity> = {}) => ({ id: "wevity:1", kind: "hackathon", title: "데이터 엔지니어링 해커톤", host: "한국데이터산업진흥원", fields: ["데이터", "AI", "클라우드"], url: "https://example.com/hackathon", daysLeft: 9, status: "접수중", firstSeenAt: "2026-11-01T00:00:00.000Z", ...overrides }) as Activity;

describe("찾은 것을 목록의 줄로", () => {
  it("공고는 앱 안의 공고 화면으로 가고, 지역 · 경력 · 직군을 조각으로 싣는다. 비어 있는 조각은 뺀다", () => {
    expect(jobItem(job())).toEqual({ kind: "job", id: "00000000-0000-4000-8000-000000000001", title: "백엔드 엔지니어", sub: "당근", meta: ["서울 강남", "신입 가능", "백엔드"], daysLeft: 12, href: "/jobs/00000000-0000-4000-8000-000000000001", external: false });
    expect(jobItem(job({ location: null, experienceLabel: " ", daysLeft: null })).meta).toEqual(["백엔드"]);
  });
  it("활동은 출처의 주소로 가고, 종류와 분야 둘까지를 조각으로 싣는다", () => {
    expect(activityItem(activity())).toEqual({ kind: "activity", id: "wevity:1", title: "데이터 엔지니어링 해커톤", sub: "한국데이터산업진흥원", meta: ["해커톤", "데이터", "AI"], daysLeft: 9, href: "https://example.com/hackathon", external: true });
    expect(activityItem(activity({ kind: "contest", fields: [] })).meta).toEqual(["공모전"]);
  });
  it("활동의 글 찾기는 제목 · 주최 · 분야를 보고, 띄어 적은 낱말이 모두 있어야 한다", () => {
    expect(activityMatches(activity(), undefined)).toBe(true);
    expect(activityMatches(activity(), "데이터")).toBe(true);
    expect(activityMatches(activity(), "ai 해커톤")).toBe(true);
    expect(activityMatches(activity(), "진흥원")).toBe(true);
    expect(activityMatches(activity(), "디자인")).toBe(false);
    expect(activityMatches(activity(), "데이터 디자인")).toBe(false);
  });
});
