import { afterEach, describe, expect, it, vi } from "vitest";

import { Work24WebAdapter } from "./work24-web.js";

/** 목록 한 줄. 체크박스 한 칸에 네 값이 `|`로 들어 있다. */
function row(index: number, no: string, type: string, company: string, title: string, due?: string) {
  return `<tr id="list${index}">
    <input class="vtalm3" type="checkbox" id="chkboxWantedAuthNo${index}"
      value="${no}|${type}|${company}|${title}"/>
    <a href="/wk/a/b/1500/empDetailAuthView.do?wantedAuthNo=${no}&amp;infoTypeCd=${type}&amp;infoTypeGroup=tb_x"></a>
    ${due ? `<p class="s1_r">마감일 : ${due}</p>` : ""}
  </tr>`;
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
    const postings = await new Work24WebAdapter().fetch("024");
    expect(postings.map((one) => one.companyName))
      .toEqual(["사람인연계회사", "잡코리아연계회사"]);
  });

  it("담당자 개인정보 안내는 본문이 아니다", async () => {
    serve({
      "currentPageNo=1": `<html>${row(1, "K1", "CSI", "회사", "개발자")}</html>`,
      "wantedAuthNo=K1": detail("<p>서버를 만듭니다</p>"),
    });
    const [posting] = await new Work24WebAdapter().fetch("024");
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
    const postings = await new Work24WebAdapter().fetch("024");
    expect(postings.map((one) => one.externalId)).toEqual(["K1"]);
  });

  it("마감일은 목록에서 읽는다 — 상세를 한 번 더 부르지 않는다", async () => {
    serve({
      "currentPageNo=1": `<html>${row(1, "K1", "CSI", "회사", "개발자", "2026-09-15")}</html>`,
      "wantedAuthNo=K1": detail("<p>본문</p>"),
    });
    const [posting] = await new Work24WebAdapter().fetch("024");
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
    const [posting] = await new Work24WebAdapter().fetch("024");
    expect(posting?.location).toBe("서울특별시 강남구");
    expect(posting?.employmentType).toBe("기간의 정함이 없는 근로계약");
    expect(posting?.experienceLabel).toBe("관계없음");
  });

  it("두 겹으로 이스케이프된 제목을 끝까지 푼다", async () => {
    // 실측: 목록의 제목이 `&amp;amp;` 로 실려 온다. 한 번만 풀면 화면에
    // `&amp;` 가 그대로 선다.
    serve({
      "currentPageNo=1": `<html>${row(1, "K1", "CSI", "회사", "WPF 클라이언트 &amp;amp; 풀스택")}</html>`,
      "wantedAuthNo=K1": detail("<p>본문</p>"),
    });
    const [posting] = await new Work24WebAdapter().fetch("024");
    expect(posting?.title).toBe("WPF 클라이언트 & 풀스택");
  });

  it("한 장이 덜 차면 거기서 멈춘다", async () => {
    const fetchMock = vi.fn(async (url: string) => new Response(
      String(url).includes("currentPageNo=1")
        ? `<html>${row(1, "K1", "CSI", "회사", "개발자")}</html>`
        : String(url).includes("wantedAuthNo") ? detail("<p>본문</p>") : "<html></html>",
      { status: 200, headers: { "content-type": "text/html" } },
    ));
    vi.stubGlobal("fetch", fetchMock);
    await new Work24WebAdapter().fetch("024");
    const listCalls = fetchMock.mock.calls
      .filter((call) => String(call[0]).includes("retriveDtlEmpSrchList"));
    expect(listCalls).toHaveLength(1);
  });
});
