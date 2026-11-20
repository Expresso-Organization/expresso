import { expect, it } from "vitest";

import { parseWevityDetail, parseWevityList, WevitySource } from "./wevity.js";

const row = (title: string, day: string, extra = "", id = "112294") => `
  <li ><!--class="bg" -->
    <div class="tit">
      <a href="?c=find&s=1&gub=1&cidx=20&gbn=view&gp=1&ix=${id}">${title} ${extra}</a>
      <div class="sub-tit">분야 : 웹/모바일/IT, 게임/소프트웨어</div>
    </div>
    <div class="organ">서울관광재단</div>
    <div class="day">
      ${day}							<span class="dday ing">접수중</span>
    </div>
  </li>`;

const detail = (period: string) => `
  <ul class="cat"><li><span class="tit">응모대상</span> 사이드 메뉴</li></ul>
  <div class="cd-area">
    <div class="img">
      <div class="thumb">
<img src="/upload/contest/20261113133114_f7b24bd6.jpg" alt="농민신문 제31회 신춘문예 작품 공모">
  <ul class="cd-info-list">
    <li><span class="tit">분야</span> 웹/모바일/IT </li>
    <li><span class="tit">응모대상</span> 일반인, 대학생 </li>
    <li class="dday-area"><span class="tit">접수기간</span> ${period} <span class="cil-dday">D-10</span></li>
    <!--li><span class="tit">참가조건</span> 전체 </li-->
    <li><span class="tit">총 상금</span> 3천만원~1천만원 </li>
    <li><span class="tit">1등 상금</span> 500만원 </li>
    <li><span class="tit">홈페이지</span> <a href="https://sto.or.kr/notice?id=1&amp;q=2" target="_blank">https://sto.or.kr</a></li>
  </ul>`;

it("목록의 줄을 마감한 줄까지 읽고, SPECIAL 줄을 넣고, 제목의 배지 글자를 지운다", () => {
  const html = row("광고 공모전", "D-28", "<span class='stat spec'>SPECIAL</span> <span class='stat idea'>IDEA</span>", "1")
    + row("INNO-CODER AI HACKATHON 참가팀 모집", "D-10", "<span class='stat new'>신규</span>", "2")
    + row("지난 공모전", "D+4", "", "3");
  expect(parseWevityList(html).map(({ id, title, daysLeft, fields }) => [id, title, daysLeft, fields.length])).toEqual([
    ["1", "광고 공모전", 28, 2],
    ["2", "INNO-CODER AI HACKATHON 참가팀 모집", 10, 2],
    ["3", "지난 공모전", -4, 2],
  ]);
});

it("상세의 정보 목록에서 접수 기간 · 대상 · 상금 · 원 공고를 읽는다", () => {
  expect(parseWevityDetail(detail("2026-11-10 ~ 2026-11-29"))).toEqual({
    applyStartOn: "2026-11-10",
    deadlineOn: "2026-11-29",
    eligibility: "일반인, 대학생",
    prize: "총 3천만원~1천만원 · 1등 500만원",
    homepageUrl: "https://sto.or.kr/notice?id=1&q=2",
    posterUrl: "https://www.wevity.com/upload/contest/20261113133114_f7b24bd6.jpg",
  });
  // 아래 목록의 다른 공모전 그림은 포스터가 아니다.
  expect(parseWevityDetail(detail("2026-11-10 ~ 2026-11-29").replace(/<div class="thumb">\s*<img[^>]*>/, "") + `<img src="/upload/contest/other.jpg">`)?.posterUrl).toBeNull();
  expect(parseWevityDetail("<html>점검 중</html>")).toBeNull();
});

it("마감일은 상세의 날짜를 쓰고, 상세를 못 읽은 줄만 남은 날로 구한다", async () => {
  const pages: Record<string, string> = {
    "cidx=20&gp=1": row("2026 서울관광 프롬프톤", "D-10", "", "112294") + row("앱 공모전", "D-3", "", "7") + row("지난 것", "D+1", "", "8"),
    "cidx=20&gp=2": row("지난 것", "D+9", "", "9"),
    "cidx=21&gp=1": row("지난 것", "D+2", "", "10"),
    "ix=112294": detail("2026-11-10 ~ 2026-11-29"),
  };
  const source = new WevitySource(async (url) => {
    const key = Object.keys(pages).find((part) => url.includes(part));
    if (!key) throw new Error(`no page ${url}`);
    return pages[key]!;
  });
  // 서울 01:44 — 목록의 남은 날이 하루 늦게 세어지는 시각이다.
  const rows = await source.fetch(new Date("2026-11-19T16:44:00Z"));
  expect(rows.map(({ sourceId, kind, deadlineOn, applyStartOn, prize }) => [sourceId, kind, deadlineOn, applyStartOn, prize])).toEqual([
    ["112294", "hackathon", "2026-11-29", "2026-11-10", "총 3천만원~1천만원 · 1등 500만원"],
    ["7", "contest", "2026-11-22", null, null],
  ]);
});

it("첫 쪽에 줄이 하나도 없으면 던진다", async () => {
  await expect(new WevitySource(async () => "<html>점검 중</html>").fetch(new Date())).rejects.toThrow("no rows");
});
