import { afterEach, describe, expect, it, vi } from "vitest";

import { LeverAdapter } from "./lever.js";

function respond(payload: unknown) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(payload), {
    status: 200, headers: { "content-type": "application/json" },
  })));
}

afterEach(() => { vi.unstubAllGlobals(); });

describe("Lever 보드 읽기", () => {
  it("나뉘어 온 본문 조각을 모두 붙인다 — `lists`에 요건이 들어 있다", async () => {
    respond([{
      id: "abc",
      text: "Backend Engineer",
      description: "<p>회사 소개입니다.</p>",
      lists: [
        { text: "자격 요건", content: "<ul><li>Node.js 3년</li></ul>" },
        { text: "우대 사항", content: "<ul><li>Kubernetes</li></ul>" },
      ],
      additional: "<p>지원 방법은 아래와 같습니다.</p>",
      hostedUrl: "https://jobs.lever.co/acme/abc",
      categories: { location: "서울", commitment: "정규직", team: "Platform" },
    }]);

    const [posting] = await new LeverAdapter().fetch("acme", "에이콤");
    expect(posting?.descriptionRaw).toContain("자격 요건");
    expect(posting?.descriptionRaw).toContain("Node.js 3년");
    expect(posting?.descriptionRaw).toContain("우대 사항");
    expect(posting?.descriptionRaw).toContain("지원 방법");
  });

  it("회사 이름 칸이 없으므로 출처에 적어 둔 이름을 쓴다 — 슬러그가 아니다", async () => {
    respond([{ id: "abc", text: "Backend Engineer", description: "<p>본문</p>" }]);
    const [posting] = await new LeverAdapter().fetch("zoyi", "채널코퍼레이션");
    expect(posting?.companyName).toBe("채널코퍼레이션");
  });

  it("없는 칸은 채우지 않는다 — 경력과 마감일은 Lever가 주지 않는다", async () => {
    respond([{ id: "abc", text: "Backend Engineer", description: "<p>본문</p>" }]);
    const [posting] = await new LeverAdapter().fetch("acme", "에이콤");
    expect(posting?.experienceLabel).toBeNull();
    expect(posting?.expiresAt).toBeNull();
  });

  it("id나 제목이 없는 줄은 버린다", async () => {
    respond([{ text: "제목만 있다" }, { id: "only-id" }, { id: "ok", text: "제대로" }]);
    const postings = await new LeverAdapter().fetch("acme", "에이콤");
    expect(postings).toHaveLength(1);
    expect(postings[0]?.externalId).toBe("ok");
  });
});
