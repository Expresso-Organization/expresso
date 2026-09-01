import { afterEach, describe, expect, it, vi } from "vitest";

import { WorkableAdapter } from "./workable.js";

function respond(payload: unknown) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(payload), {
    status: 200, headers: { "content-type": "application/json" },
  })));
}

afterEach(() => { vi.unstubAllGlobals(); });

describe("Workable 보드 읽기", () => {
  it("응답 맨 위의 회사 이름을 쓴다", async () => {
    respond({ name: "Lunit", jobs: [{ shortcode: "A1", title: "ML Engineer", description: "<p>본문</p>" }] });
    const [posting] = await new WorkableAdapter().fetch("lunit", "출처이름");
    expect(posting?.companyName).toBe("Lunit");
  });

  it("회사 이름이 비면 출처에 적어 둔 이름으로 메운다", async () => {
    respond({ jobs: [{ shortcode: "A1", title: "ML Engineer", description: "<p>본문</p>" }] });
    const [posting] = await new WorkableAdapter().fetch("lunit", "루닛");
    expect(posting?.companyName).toBe("루닛");
  });

  it("겹치는 지명은 한 번만 적는다", async () => {
    respond({ name: "Lunit", jobs: [{
      shortcode: "A1", title: "ML Engineer", description: "<p>본문</p>",
      city: "Seoul", state: "Seoul", country: "South Korea",
    }] });
    const [posting] = await new WorkableAdapter().fetch("lunit", "루닛");
    expect(posting?.location).toBe("Seoul, South Korea");
  });

  it("지명이 하나도 없으면 null이다 — 빈 문자열을 만들지 않는다", async () => {
    respond({ name: "Lunit", jobs: [{ shortcode: "A1", title: "ML Engineer", description: "<p>본문</p>" }] });
    const [posting] = await new WorkableAdapter().fetch("lunit", "루닛");
    expect(posting?.location).toBeNull();
  });
});
