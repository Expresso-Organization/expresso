import { afterEach, describe, expect, it, vi } from "vitest";

import { GreetingAdapter } from "./greeting.js";

/** 아직 아무것도 안 들였고, 전부 들일 생각이 있는 상태. */
const ALL = { isKnown: () => false, wants: () => true };

const adapter = () => new GreetingAdapter({ minIntervalMs: 0 });

/** 그리팅은 두 페이지를 부른다 — 목록과 공고. 주소로 갈라 답한다. */
function serve(pages: Record<string, unknown>) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const key = Object.keys(pages).find((one) => String(url).includes(one));
    if (!key) return new Response("not found", { status: 404 });
    const html = `<html><body><script id="__NEXT_DATA__" type="application/json">${
      JSON.stringify(pages[key])}</script></body></html>`;
    return new Response(html, { status: 200, headers: { "content-type": "text/html" } });
  }));
}

/** `dehydratedState.queries[].state.data` 모양을 만든다. */
function page(...data: unknown[]) {
  return { props: { pageProps: { dehydratedState: { queries: data.map((one) => ({ state: { data: one } })) } } } };
}

function opening(over: Record<string, unknown> = {}) {
  return {
    openingId: 101,
    title: "Backend Engineer",
    dueDate: null,
    group: { name: "무신사" },
    openingJobPosition: {
      openingJobPositions: [{
        workspaceOccupation: { occupation: "Engineering" },
        workspaceJob: { job: "Backend Engineering" },
        workspacePlace: { location: "무신사 성수 오피스" },
        jobPositionCareer: { careerFrom: 7, careerTo: null, careerType: "EXPERIENCED" },
        jobPositionEmployment: { employmentType: "FULL_TIME_WORKER" },
      }],
    },
    ...over,
  };
}

const detail = (html: string) => page({ data: { openingsInfo: { detail: html } } });

afterEach(() => { vi.unstubAllGlobals(); });

describe("그리팅 보드 읽기", () => {
  it("목록을 몇 번째 쿼리인지로 찾지 않는다 — `openingId`를 가진 배열을 찾는다", async () => {
    serve({
      // 앞에 관계없는 쿼리를 셋 두고, 진짜 목록은 네 번째에 둔다.
      "/ko/home": page({ brandColor: "#000" }, null, [{ place: "성수" }], [opening()]),
      "/ko/o/101": detail("<h3>주요 업무</h3><p>서버를 만든다</p>"),
    });
    const { postings } = await adapter().fetch("musinsa", "무신사", ALL);
    expect(postings).toHaveLength(1);
    expect(postings[0]?.title).toBe("Backend Engineer");
    expect(postings[0]?.descriptionRaw).toContain("주요 업무");
  });

  it("회사 이름은 목록이 준 값을 쓴다", async () => {
    serve({ "/ko/home": page([opening()]), "/ko/o/101": detail("<p>본문</p>") });
    const { postings: [posting] } = await adapter().fetch("musinsa", "출처이름", ALL);
    expect(posting?.companyName).toBe("무신사");
  });

  it("실측한 고용형태만 옮기고 처음 보는 값은 그대로 둔다", async () => {
    const withType = (employmentType: string) => ({
      "/ko/home": page([opening({
        openingJobPosition: { openingJobPositions: [{ jobPositionEmployment: { employmentType } }] },
      })]),
      "/ko/o/101": detail("<p>본문</p>"),
    });

    serve(withType("FULL_TIME_WORKER"));
    expect((await adapter().fetch("a", "A", ALL)).postings[0]?.employmentType).toBe("정규직");

    serve(withType("DAILY_WORKER"));
    expect((await adapter().fetch("a", "A", ALL)).postings[0]?.employmentType).toBe("DAILY_WORKER");
  });

  it("경력은 년 단위다 — 그리팅 화면이 같은 값을 `경력 7년 이상`으로 찍는다", async () => {
    serve({ "/ko/home": page([opening()]), "/ko/o/101": detail("<p>본문</p>") });
    expect((await adapter().fetch("a", "A", ALL)).postings[0]?.experienceLabel).toBe("경력 7년 이상");
  });

  it("경력 구간과 신입·무관을 나눠 적는다", async () => {
    const withCareer = (jobPositionCareer: unknown) => ({
      "/ko/home": page([opening({
        openingJobPosition: { openingJobPositions: [{ jobPositionCareer }] },
      })]),
      "/ko/o/101": detail("<p>본문</p>"),
    });

    serve(withCareer({ careerFrom: 3, careerTo: 5, careerType: "EXPERIENCED" }));
    expect((await adapter().fetch("a", "A", ALL)).postings[0]?.experienceLabel).toBe("경력 3~5년");

    serve(withCareer({ careerType: "NEW_COMER" }));
    expect((await adapter().fetch("a", "A", ALL)).postings[0]?.experienceLabel).toBe("신입");

    serve(withCareer({ careerType: "NOT_MATTER" }));
    expect((await adapter().fetch("a", "A", ALL)).postings[0]?.experienceLabel).toBe("경력무관");
  });

  it("본문을 못 읽은 공고는 들이지 않는다 — 나머지는 계속 간다", async () => {
    serve({
      "/ko/home": page([opening(), opening({ openingId: 102, title: "본문 없는 자리" })]),
      "/ko/o/101": detail("<p>본문</p>"),
      // 102는 답하지 않는다(404).
    });
    const { postings } = await adapter().fetch("musinsa", "무신사", ALL);
    expect(postings.map((one) => one.externalId)).toEqual(["101"]);
  });


  it("이미 들인 공고는 상세를 열지 않고 되짚어만 온다", async () => {
    const opened: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const text = String(url);
      const pages: Record<string, unknown> = {
        "/ko/home": page([opening(), opening({ openingId: 202, title: "처음 보는 자리" })]),
        "/ko/o/101": detail("<p>본문</p>"),
        "/ko/o/202": detail("<p>본문</p>"),
      };
      const key = Object.keys(pages).find((one) => text.includes(one));
      if (!key) return new Response("not found", { status: 404 });
      if (key.startsWith("/ko/o/")) opened.push(key);
      const html = `<html><body><script id="__NEXT_DATA__" type="application/json">${
        JSON.stringify(pages[key])}</script></body></html>`;
      return new Response(html, { status: 200 });
    }));

    const result = await adapter().fetch("musinsa", "무신사", { isKnown: (id: string) => id === "101", wants: () => true });
    expect(opened).toEqual(["/ko/o/202"]);
    expect(result.postings.map((one) => one.externalId)).toEqual(["202"]);
    expect(result.refresh).toEqual([{
      externalId: "101",
      title: "Backend Engineer",
      team: "Backend Engineering",
      location: "무신사 성수 오피스",
      expiresAt: null,
    }]);
  });

  it("마감일이 있으면 옮기고 없으면 null이다", async () => {
    serve({
      "/ko/home": page([opening({ dueDate: "2026-12-31T14:59:59Z" })]),
      "/ko/o/101": detail("<p>본문</p>"),
    });
    const { postings: [posting] } = await adapter().fetch("a", "A", ALL);
    expect(posting?.expiresAt?.toISOString()).toBe("2026-12-31T14:59:59.000Z");
  });
});
