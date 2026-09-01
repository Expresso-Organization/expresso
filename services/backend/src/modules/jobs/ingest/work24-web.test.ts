import { afterEach, describe, expect, it, vi } from "vitest";

import { Work24WebAdapter } from "./work24-web.js";

/** 아직 아무것도 안 들였고, 전부 들일 생각이 있는 상태. */
const ALL = { isKnown: () => false, wants: () => true };

/** 목록 한 줄. 체크박스 한 칸에 네 값이 `|`로 들어 있다. */
function row(
  index: number, no: string, type: string, company: string, title: string,
  due?: string, posted?: string,
) {
  return `<tr id="list${index}">
    <input class="vtalm3" type="checkbox" id="chkboxWantedAuthNo${index}"
      value="${no}|${type}|${company}|${title}"/>
    <a href="/wk/a/b/1500/empDetailAuthView.do?wantedAuthNo=${no}&amp;infoTypeCd=${type}&amp;infoTypeGroup=tb_x"></a>
    ${due ? `<p class="s1_r">마감일 : ${due}</p>` : ""}
    ${posted ? `<p class="s1_r">등록일 : ${posted}</p>` : ""}
  </tr>`;
}

/** 오늘에서 며칠 전. 목록의 등록일 칸과 같은 모양으로. */
const PAGE_ROWS = 100;

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

function detail(body: string | null, fields: Record<string, string> = {}) {
  const pairs = Object.entries(fields)
    .map(([k, v]) => `<li><em class="tit">${k}</em><p>${v}</p></li>`).join("");
  // 담당자 개인정보 안내가 늘 같이 붙어 온다. 본문으로 집으면 안 된다.
  const notice = `<div class="fold"><strong>채용 담당자 정보 열람 시 주의사항</strong>
    담당자 연락처는 채용 목적으로만 씁니다</div>`;
  const work = body === null ? "" : `<div class="fold"><strong class="block">직무내용</strong>${body}</div>`;
  return `<html><ul class="list">${pairs}</ul>${work}${notice}</html>`;
}

function serve(pages: Record<string, string>) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const key = Object.keys(pages).find((one) => String(url).includes(one));
    return key
      ? new Response(pages[key], { status: 200, headers: { "content-type": "text/html" } })
      : new Response("<html></html>", { status: 200, headers: { "content-type": "text/html" } });
  }));
}

afterEach(() => { vi.unstubAllGlobals(); });

describe("고용24 채용정보 목록 읽기", () => {
  it("정보구분을 고정하지 않는다 — 공고마다 다르고 사람인·잡코리아가 90%다", async () => {
    serve({
      "currentPageNo=1": `<html>${row(1, "K1", "CSI", "사람인연계회사", "백엔드 개발자")}
        ${row(2, "K2", "CJK", "잡코리아연계회사", "프론트엔드 개발자")}</html>`,
      "wantedAuthNo=K1": detail("<p>서버를 만듭니다</p>"),
      "wantedAuthNo=K2": detail("<p>화면을 만듭니다</p>"),
    });
    const { postings } = await new Work24WebAdapter({ minIntervalMs: 0 }).fetch("024", "고용24", ALL);
    expect(postings.map((one) => one.companyName))
      .toEqual(["사람인연계회사", "잡코리아연계회사"]);
  });

  it("담당자 개인정보 안내는 본문이 아니다", async () => {
    serve({
      "currentPageNo=1": `<html>${row(1, "K1", "CSI", "회사", "개발자")}</html>`,
      "wantedAuthNo=K1": detail("<p>서버를 만듭니다</p>"),
    });
    const { postings: [posting] } = await new Work24WebAdapter({ minIntervalMs: 0 }).fetch("024", "고용24", ALL);
    expect(posting?.descriptionRaw).toContain("서버를 만듭니다");
    expect(posting?.descriptionRaw).not.toContain("담당자 연락처");
  });

  it("직무내용이 없는 공고는 들이지 않는다", async () => {
    serve({
      "currentPageNo=1": `<html>${row(1, "K1", "CSI", "회사", "개발자")}
        ${row(2, "K2", "CSI", "본문없는회사", "개발자")}</html>`,
      "wantedAuthNo=K1": detail("<p>서버를 만듭니다</p>"),
      "wantedAuthNo=K2": detail(null),
    });
    const { postings } = await new Work24WebAdapter({ minIntervalMs: 0 }).fetch("024", "고용24", ALL);
    expect(postings.map((one) => one.externalId)).toEqual(["K1"]);
  });

  it("마감일은 목록에서 읽는다 — 상세를 한 번 더 부르지 않는다", async () => {
    serve({
      "currentPageNo=1": `<html>${row(1, "K1", "CSI", "회사", "개발자", "2026-09-15")}</html>`,
      "wantedAuthNo=K1": detail("<p>본문</p>"),
    });
    const { postings: [posting] } = await new Work24WebAdapter({ minIntervalMs: 0 }).fetch("024", "고용24", ALL);
    // 한국 시간 23:59:59 → UTC 14:59:59
    expect(posting?.expiresAt?.toISOString()).toBe("2026-09-15T14:59:59.000Z");
  });

  it("지역·고용형태·경력을 구조화된 칸에서 읽는다", async () => {
    serve({
      "currentPageNo=1": `<html>${row(1, "K1", "CSI", "회사", "개발자")}</html>`,
      "wantedAuthNo=K1": detail("<p>본문</p>", {
        경력: "관계없음", 지역: "서울특별시 강남구", 고용형태: "기간의 정함이 없는 근로계약",
      }),
    });
    const { postings: [posting] } = await new Work24WebAdapter({ minIntervalMs: 0 }).fetch("024", "고용24", ALL);
    expect(posting?.location).toBe("서울특별시 강남구");
    expect(posting?.employmentType).toBe("기간의 정함이 없는 근로계약");
    expect(posting?.experienceLabel).toBe("관계없음");
  });


  it("등록일 창을 벗어나면 목록 넘기기를 멈춘다", async () => {
    // 목록은 등록일 내림차순이다. 하루 한 번 도는 잡이 매번 전량을 훑을 이유가
    // 없어, 창 밖 줄을 만나면 그 자리에서 끝낸다.
    const fetchMock = vi.fn(async (url: string) => {
      const text = String(url);
      if (text.includes("retriveDtlEmpSrchList")) {
        const page = Number(/currentPageNo=(\d+)/.exec(text)?.[1] ?? "1");
        const posted = page === 1 ? daysAgo(1) : daysAgo(30);
        const rows = Array.from({ length: PAGE_ROWS }, (_, i) =>
          row(i, `K${page}-${i}`, "CSI", "회사", "개발자", undefined, posted)).join("");
        return new Response(`<html>${rows}</html>`, { status: 200 });
      }
      return new Response(detail("<p>본문</p>"), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { postings } = await new Work24WebAdapter({ minIntervalMs: 0 }).fetch("024", "고용24", ALL);
    const listCalls = fetchMock.mock.calls
      .filter((call) => String(call[0]).includes("retriveDtlEmpSrchList"));
    // 2쪽에서 창을 벗어났다 — 3쪽은 부르지 않는다.
    expect(listCalls).toHaveLength(2);
    expect(postings).toHaveLength(PAGE_ROWS);
  });

  it("등록일을 못 읽은 줄은 남긴다 — 못 읽은 것을 오래된 것으로 바꿔 말하지 않는다", async () => {
    serve({
      "currentPageNo=1": `<html>${row(1, "K1", "CSI", "회사", "개발자")}</html>`,
      "wantedAuthNo=K1": detail("<p>본문</p>"),
    });
    const { postings } = await new Work24WebAdapter({ minIntervalMs: 0 }).fetch("024", "고용24", ALL);
    expect(postings.map((one) => one.externalId)).toEqual(["K1"]);
  });

  it("상대가 밀어내면 그 출처를 통째로 실패로 남긴다", async () => {
    // 429 를 받고도 남은 공고를 계속 두드리면, 막힌 사실이 "몇 건 모았다"에
    // 묻힌다. 던져서 last_error 에 남긴다.
    let details = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (String(url).includes("retriveDtlEmpSrchList")) {
        const rows = Array.from({ length: 20 }, (_, i) =>
          row(i, `K${i}`, "CSI", "회사", "개발자", undefined, daysAgo(1))).join("");
        return new Response(`<html>${rows}</html>`, { status: 200 });
      }
      details += 1;
      return new Response("too many", { status: 429, headers: { "retry-after": "60" } });
    }));

    await expect(new Work24WebAdapter({ minIntervalMs: 0 }).fetch("024", "고용24", ALL)).rejects.toThrow("HTTP 429");
    // 스무 건을 끝까지 두드리지 않는다.
    expect(details).toBeLessThan(20);
  });


  it("이미 들인 공고는 상세를 열지 않는다", async () => {
    const details: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const text = String(url);
      if (text.includes("retriveDtlEmpSrchList")) {
        const rows = [
          row(0, "OLD", "CSI", "회사", "이미 들인 개발자", "2026-09-15", daysAgo(1)),
          row(1, "NEW", "CSI", "회사", "처음 보는 개발자", undefined, daysAgo(1)),
        ].join("");
        return new Response(`<html>${rows}</html>`, { status: 200 });
      }
      details.push(/wantedAuthNo=([A-Z0-9]+)/.exec(text)?.[1] ?? "?");
      return new Response(detail("<p>본문</p>"), { status: 200 });
    }));

    const known = { isKnown: (id: string) => id === "OLD", wants: () => true };
    const result = await new Work24WebAdapter({ minIntervalMs: 0 }).fetch("024", "고용24", known);

    expect(details).toEqual(["NEW"]);
    expect(result.postings.map((one) => one.externalId)).toEqual(["NEW"]);
    // 건너뛴 것도 되짚어 온다 — 갈래와 마감을 다시 붙일 수 있어야 한다.
    expect(result.refresh).toEqual([{
      externalId: "OLD",
      title: "이미 들인 개발자",
      team: null,
      location: null,
      expiresAt: new Date("2026-09-15T14:59:59.000Z"),
    }]);
  });


  it("들일 생각이 없는 공고는 상세를 열지 않는다", async () => {
    // 상세는 공고 하나에 요청 하나다. 제목만으로 가릴 수 있는 것을 받아 놓고
    // 버리는 것이 이 수집에서 가장 큰 낭비다.
    const opened: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const text = String(url);
      if (text.includes("retriveDtlEmpSrchList")) {
        const rows = [
          row(0, "DEV", "CSI", "회사", "백엔드 개발자", undefined, daysAgo(1)),
          row(1, "COOK", "CSI", "회사", "조리원 모집", undefined, daysAgo(1)),
        ].join("");
        return new Response(`<html>${rows}</html>`, { status: 200 });
      }
      opened.push(/wantedAuthNo=([A-Z0-9]+)/.exec(text)?.[1] ?? "?");
      return new Response(detail("<p>본문</p>"), { status: 200 });
    }));

    const scope = { isKnown: () => false, wants: (title: string) => title.includes("개발자") };
    const result = await new Work24WebAdapter({ minIntervalMs: 0 }).fetch("024", "고용24", scope);

    expect(opened).toEqual(["DEV"]);
    expect(result.postings.map((one) => one.externalId)).toEqual(["DEV"]);
    // 건너뛴 것도 센다 — 출처가 몇 건을 내놓았는지가 화면에 남는다.
    expect(result.skippedUnwanted).toBe(1);
  });

  it("두 겹으로 이스케이프된 제목을 끝까지 푼다", async () => {
    // 실측: 목록의 제목이 `&amp;amp;` 로 실려 온다. 한 번만 풀면 화면에
    // `&amp;` 가 그대로 선다.
    serve({
      "currentPageNo=1": `<html>${row(1, "K1", "CSI", "회사", "WPF 클라이언트 &amp;amp; 풀스택")}</html>`,
      "wantedAuthNo=K1": detail("<p>본문</p>"),
    });
    const { postings: [posting] } = await new Work24WebAdapter({ minIntervalMs: 0 }).fetch("024", "고용24", ALL);
    expect(posting?.title).toBe("WPF 클라이언트 & 풀스택");
  });

  it("파싱에서 빠지는 줄이 있어도 마지막 장으로 오해하지 않는다", async () => {
    // 실측에서 100줄짜리 장이 99건으로 파싱됐다. 그걸 덜 찬 장으로 읽으면
    // 첫 장에서 멈춘다.
    const fetchMock = vi.fn(async (url: string) => {
      const text = String(url);
      if (text.includes("retriveDtlEmpSrchList")) {
        const page = Number(/currentPageNo=(\d+)/.exec(text)?.[1] ?? "1");
        const posted = page === 1 ? daysAgo(1) : daysAgo(30);
        // 99줄은 제대로, 한 줄은 상세 링크 없이 — 표에는 100줄이 실린다.
        const good = Array.from({ length: PAGE_ROWS - 1 }, (_, i) =>
          row(i, `K${page}-${i}`, "CSI", "회사", "개발자", undefined, posted)).join("");
        const broken = `<tr id="list${PAGE_ROWS}"><td>링크 없는 줄</td></tr>`;
        return new Response(`<html>${good}${broken}</html>`, { status: 200 });
      }
      return new Response(detail("<p>본문</p>"), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await new Work24WebAdapter({ minIntervalMs: 0 }).fetch("024", "고용24", ALL);
    const listCalls = fetchMock.mock.calls
      .filter((call) => String(call[0]).includes("retriveDtlEmpSrchList"));
    // 2쪽까지 갔다가 창 밖을 만나 멈춘다. 1쪽에서 끝나지 않는다.
    expect(listCalls).toHaveLength(2);
  });

  it("표에 줄이 없으면 거기서 멈춘다", async () => {
    const fetchMock = vi.fn(async (url: string) => new Response(
      String(url).includes("currentPageNo=1")
        ? `<html>${row(1, "K1", "CSI", "회사", "개발자")}</html>`
        : String(url).includes("wantedAuthNo") ? detail("<p>본문</p>") : "<html></html>",
      { status: 200, headers: { "content-type": "text/html" } },
    ));
    vi.stubGlobal("fetch", fetchMock);
    await new Work24WebAdapter({ minIntervalMs: 0 }).fetch("024", "고용24", ALL);
    const listCalls = fetchMock.mock.calls
      .filter((call) => String(call[0]).includes("retriveDtlEmpSrchList"));
    expect(listCalls).toHaveLength(1);
  });
});
