import { expect, it } from "vitest";

import { isHackathon, parseWevityRows, readKind } from "./explore";

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
    <div class="read">2,052</div>
  </li>`;

it("위비티 목록의 한 줄에서 제목 · 주최 · 분야 · 남은 날 · 원문 주소를 읽는다", () => {
  const [activity] = parseWevityRows(row("2026 서울관광 프롬프톤", "D-14"));
  expect(activity).toEqual({
    id: "112294",
    title: "2026 서울관광 프롬프톤",
    url: "https://www.wevity.com/?c=find&s=1&gbn=view&ix=112294",
    host: "서울관광재단",
    fields: ["웹/모바일/IT", "게임/소프트웨어"],
    daysLeft: 14,
    status: "접수중",
  });
});

it("상단 고정 광고 줄과 접수가 끝난 줄은 뺀다", () => {
  const html = row("광고 공모전", "D-28", "<span class='stat spec'>SPECIAL</span>") + row("지난 공모전!", "D+4") + row("남은 공모전!!", "D-3");
  expect(parseWevityRows(html).map((activity) => activity.title)).toEqual(["남은 공모전!!"]);
});

it("목록 모양이 바뀌어 읽히는 줄이 없으면 빈 목록이다", () => {
  expect(parseWevityRows("<html><body>점검 중</body></html>")).toEqual([]);
});

it("해커톤은 제목으로 가른다", () => {
  expect(isHackathon("2026 청도 바이브코딩 해커톤 with 해커그라운드")).toBe(true);
  expect(isHackathon("현대자동차그룹 차량용 앱 개발 공모전")).toBe(false);
});

it("모르는 종류는 채용 공고로 읽는다", () => {
  expect(readKind("contest")).toBe("contest");
  expect(readKind("unknown")).toBe("jobs");
  expect(readKind(undefined)).toBe("jobs");
});
