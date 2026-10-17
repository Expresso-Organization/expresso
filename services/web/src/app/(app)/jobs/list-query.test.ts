import { describe, expect, it } from "vitest";

import { backToListHref, currentListQuery, detailHref, isInterestedList } from "./list-query";

describe("currentListQuery", () => {
  it("아는 조건만 담는다", () => {
    const query = currentListQuery({ q: "백엔드", country: "한국", 몰라: "값" });
    expect(query).toContain("q=%EB%B0%B1%EC%97%94%EB%93%9C");
    expect(query).toContain("country=%ED%95%9C%EA%B5%AD");
    expect(query).not.toContain("몰라");
  });

  it("조건이 없으면 빈 문자열이다 — 빈 from을 달고 다니지 않는다", () => {
    expect(currentListQuery({})).toBe("");
  });

  it("관심 공고만 보는 조건을 담는다", () => {
    expect(currentListQuery({ interested: "true", page: "2" })).toBe("page=2&interested=true");
  });

  it("interested는 true가 아니면 버린다 — 서버가 받는 값이라도 화면에 없는 목록이다", () => {
    for (const value of ["false", "1", "TRUE", ""]) {
      expect(currentListQuery({ interested: value })).toBe("");
    }
  });

  it("배열로 온 값은 무시한다 — 같은 키가 두 번 온 주소는 우리 것이 아니다", () => {
    expect(currentListQuery({ sort: ["recent", "deadline"] })).toBe("");
  });
});

describe("detailHref", () => {
  it("조건이 없으면 from을 붙이지 않는다", () => {
    expect(detailHref("job-1", "")).toBe("/jobs/job-1");
  });

  it("조건이 있으면 통째로 실어 보낸다", () => {
    expect(detailHref("job-1", "country=%ED%95%9C%EA%B5%AD&page=2")).toBe(
      "/jobs/job-1?from=country%3D%25ED%2595%259C%25EA%25B5%25AD%26page%3D2",
    );
  });
});

describe("backToListHref", () => {
  it("from이 없으면 목록으로 간다", () => {
    expect(backToListHref(undefined)).toBe("/jobs");
    expect(backToListHref("")).toBe("/jobs");
  });

  it("실어 보낸 조건을 그대로 되살린다", () => {
    // 순서는 우리가 정한 목록 순이다 — 같은 조건이면 늘 같은 주소가 된다.
    expect(backToListHref("country=한국&page=3&sort=recent")).toBe(
      "/jobs?sort=recent&page=3&country=%ED%95%9C%EA%B5%AD",
    );
  });

  it("모르는 조건은 버린다 — 주소창으로 아무 값이나 실어 나를 수 없다", () => {
    expect(backToListHref("company=abc&evil=1&redirect=https://elsewhere.example")).toBe(
      "/jobs?company=abc",
    );
  });

  it("결과는 언제나 /jobs로 시작한다 — 바깥으로 나가는 주소가 될 수 없다", () => {
    for (const attack of [
      "//elsewhere.example",
      "https://elsewhere.example",
      "q=..%2F..%2Fadmin",
      "\\\\elsewhere.example",
    ]) {
      expect(backToListHref(attack).startsWith("/jobs")).toBe(true);
    }
  });

  it("관심 공고 목록에서 왔으면 관심 공고 목록으로 돌아간다", () => {
    const from = currentListQuery({ interested: "true", category: "family:백엔드" });
    expect(backToListHref(from)).toBe(
      "/jobs?category=family%3A%EB%B0%B1%EC%97%94%EB%93%9C&interested=true",
    );
  });

  it("interested에 다른 값을 실어 보내면 버린다", () => {
    expect(backToListHref("interested=false&sort=recent")).toBe("/jobs?sort=recent");
  });

  it("지나치게 긴 값은 담지 않는다", () => {
    expect(backToListHref(`q=${"가".repeat(300)}`)).toBe("/jobs");
  });
});

describe("isInterestedList", () => {
  it("interested=true일 때만 참이다", () => {
    expect(isInterestedList({ interested: "true" })).toBe(true);
    expect(isInterestedList({ interested: "false" })).toBe(false);
    expect(isInterestedList({ interested: ["true", "true"] })).toBe(false);
    expect(isInterestedList({})).toBe(false);
  });
});
