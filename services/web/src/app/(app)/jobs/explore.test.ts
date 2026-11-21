import { expect, it } from "vitest";

import type { Activity } from "@expresso/contracts";

import { activityInitial, activityLine, activitySourceNote, exploreHref, readKind, tuitionLabel } from "./explore";

it("모르는 종류는 채용 공고로 읽는다", () => {
  expect(readKind("contest")).toBe("contest");
  expect(readKind("unknown")).toBe("jobs");
  expect(readKind(undefined)).toBe("jobs");
});

it("채용 공고는 종류를 주소에 적지 않는다", () => {
  expect(exploreHref("jobs")).toEqual({ pathname: "/jobs", query: {} });
  expect(exploreHref("hackathon")).toEqual({ pathname: "/jobs", query: { kind: "hackathon" } });
});

const activity = (extra: Partial<Activity>): Activity => ({
  id: "wevity:1", source: "wevity", kind: "contest", title: "공모전", host: "주최", fields: [], url: "https://example.com", homepageUrl: null,
  applyStartOn: null, deadlineOn: "2026-11-29", deadlinePrecision: "day", daysLeft: 9, status: "접수중", startsOn: null,
  eligibility: null, prize: null, tuition: null, nbcardRequired: null, firstSeenAt: "2026-11-20T00:00:00.000Z", poster: null, ...extra,
});

it("공모전 줄은 대상 · 상금을, 접수 전이면 접수 시작일을 보인다", () => {
  expect(activityLine(activity({ eligibility: "대학생", prize: "총 540만 원" }))).toEqual({ meta: "주최 · 대학생 · 총 540만 원", deadline: "D-9", urgent: false });
  expect(activityLine(activity({ status: "접수예정", applyStartOn: "2026-11-23", daysLeft: 3 })).meta).toBe("주최 · 11월 23일 접수 시작");
  expect(activityLine(activity({ daysLeft: 3 })).urgent).toBe(true);
});

it("부트캠프 줄은 학비 · 내일배움카드 · 수업 시작일을, 달로만 적힌 마감은 「그달 중」으로 보인다", () => {
  const row = activity({ kind: "bootcamp", tuition: 600_000, nbcardRequired: true, startsOn: "2026-12-29", deadlineOn: "2026-12-31", deadlinePrecision: "month", daysLeft: 41 });
  expect(activityLine(row)).toEqual({ meta: "주최 · 60만원 · 내일배움카드 · 12월 29일 수업 시작", deadline: "12월 중", urgent: false });
  expect(tuitionLabel(0)).toBe("무료");
  expect(tuitionLabel(49_000)).toBe("4.9만원");
});

it("출처 안내는 목록에 실린 출처를 많은 순으로 적는다", () => {
  expect(activitySourceNote([activity({ source: "linkareer" }), activity({ source: "wevity" }), activity({ source: "linkareer" })])).toBe("링커리어 · 위비티");
});

it("포스터 없는 카드의 이니셜은 주최 이름의 앞머리 · 숫자를 건너뛴 첫 글자다", () => {
  expect(activityInitial("(재)운당나눔재단")).toBe("운");
  expect(activityInitial("[주최] 한국관광공사")).toBe("한");
  expect(activityInitial("4·16재단")).toBe("재");
  expect(activityInitial("네이버 커넥트재단")).toBe("네");
  expect(activityInitial("Team.HUMAN")).toBe("T");
});
