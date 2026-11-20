import { expect, it } from "vitest";

import { boottentDate, boottentRow, BoottentSource, parseBoottentCamps } from "./boottent.js";
import { contestKoreaPoster, contestKoreaRow, parseContestKoreaList } from "./contestkorea.js";
import { devEventRow, openGraphImage, parseDevEventReadme } from "./devevent.js";
import { linkareerPrize, linkareerRow, LinkareerSource } from "./linkareer.js";

const AT = new Date("2026-11-20T03:00:00Z");

it("링커리어: 밀리초 시각을 서울 날짜로, 시상 규모를 만 원으로 읽는다", () => {
  const row = linkareerRow({
    id: "296803", title: "팔공산케이블카 Four Season 사진 영상 공모전", organizationName: "팔공산케이블카",
    recruitStartAt: 1767625200000, recruitCloseAt: 1796137199999, homepageURL: null, awards: "540",
    targets: [{ name: "대상 제한 없음" }], categories: [{ name: "사진/영상/UCC" }], thumbnailImage: { url: "https://api.linkareer.com/attachments/783240" },
  }, AT);
  expect(row).toMatchObject({ sourceId: "296803", applyStartOn: "2026-01-06", deadlineOn: "2026-12-01", prize: "총 540만 원", eligibility: "제한 없음", url: "https://linkareer.com/activity/296803", posterUrl: "https://api.linkareer.com/attachments/783240" });
  expect(linkareerPrize("0")).toBeNull();
});

it("링커리어: 응답에 오류가 오면 던진다", async () => {
  const source = new LinkareerSource(async () => JSON.stringify({ errors: [{ message: "Cannot query field" }] }));
  await expect(source.fetch(AT)).rejects.toThrow("Cannot query field");
});

it("콘테스트코리아: 줄을 읽고 남은 날로 연도를 정한다", () => {
  const html = `<div class="list_style_2"><ul>
    <li class="imminent"> <!-- special --> <div class="title"> <a href="view.php?int_gbn=1&Txt_bcode=030310001&str_no=202611190035"> <span class="category">학문•과학•IT</span> <span class="txt">제 3회 스마트그리드 아이디어 공모전</span> </a> </div>
      <ul class="host"> <li class="icon_1"><strong>주최</strong> . 한국스마트그리드협회</li> <li class="icon_2"><strong>대상</strong> . 대학생 , 대학원생 </li> </ul>
      <div class="date"> <div class="date-detail"> <span class="step-1"><em>접수</em> 11.16~01.10 </span> </div> </div>
      <div class="d-day orange"> <span class="day" style='color:#ff0000'>D-51</span> <span class="condition">접수중</span> </div> </li>
  </ul></div><div class="pagination">`;
  const [item] = parseContestKoreaList(html);
  expect(item).toMatchObject({ id: "202611190035", host: "한국스마트그리드협회", eligibility: "대학생, 대학원생", daysLeft: 51 });
  expect(contestKoreaRow(item!, AT)).toMatchObject({ applyStartOn: "2026-11-16", deadlineOn: "2027-01-10", kind: "contest" });
});

it("Dev-Event: 달별 절의 대회만 읽고, 당일 행사는 행사일을 마감으로 둔다", () => {
  const markdown = [
    "## `26년 11월`",
    "- __[Notion AI Hackathon Seoul](https://luma.com/vc6rmvaz)__",
    "  - 분류: `오프라인(서울 서초구)`, `무료`, `대회`, `AI`",
    "  - 주최: Notion",
    "  - 일시: 11. 21(토) 10:00 ~ 11. 21(토) 19:00",
    "- __[PyTorch Day Korea 2026](https://pytorchday.kr/)__",
    "  - 분류: `오프라인(서울 강남구)`, `유료`, `세미나`, `AI`",
    "  - 접수: 10. 16(금) 09:30 ~ 11. 18(수) 12:00",
    "## `26년 12월`",
    "- __[2026 HAI(하이)! 챌린지](https://daker.ai/public/hackathons/2026-hai)__",
    "  - 분류: `온라인`, `무료`, `대회`, `AI`, `블록체인`",
    "  - 주최: 헥토",
    "  - 접수: 10. 26(월) 10:00 ~ 01. 05(화) 10:00",
    "## 지난 행사 기록",
    "- __[지난 해커톤](https://example.com/old)__",
    "  - 분류: `대회`",
    "  - 접수: 01. 01(목) ~ 01. 02(금)",
  ].join("\n");
  const rows = parseDevEventReadme(markdown).flatMap((item) => devEventRow(item, AT) ?? []);
  expect(rows.map(({ title, kind, applyStartOn, deadlineOn, startsOn, fields }) => [title, kind, applyStartOn, deadlineOn, startsOn, fields])).toEqual([
    ["Notion AI Hackathon Seoul", "hackathon", null, "2026-11-21", "2026-11-21", ["AI"]],
    ["2026 HAI(하이)! 챌린지", "contest", "2026-10-26", "2027-01-05", null, ["AI", "블록체인"]],
  ]);
});

it("부트텐트: 과정 객체를 읽고, 「그달 중」 마감은 말일로, 학비는 원으로 바꾼다", async () => {
  const camp = { campId: "codeitsprint-productdesign", batchId: "1", batchName: "16기", title: "프로덕트 디자이너 과정", brandName: "코드잇 스프린트",
    regDate: "2026-11-04 00:00", regEndDate: "2026-12-98 23:59", startDate: "2026-12-29", tuition: 60, nbcardRequired: true,
    qualification: "- 내일배움카드 발급자 대상\n- 정규 훈련 시간 참여 가능자", keywords: ["UI디자인", "Figma"], campUrl: "https://sprint.codeit.kr/track/product-design?utm_source=boottent_paid&x=1",
    image: "https://cdn.sayun.studio/boottent/images/camps/top/header_ce8051a8.webp" };
  const early = { ...camp, campId: "nobreak-dobong", batchId: "2", regDate: "2026-11-02 00:00", regEndDate: "2026-11-29 23:59", startDate: "2026-11-02", tuition: 4.9, nbcardRequired: false };
  const flight = JSON.stringify(`3:["$","div",null,{"ads":{"camp":${JSON.stringify(camp)}},"camps":[${JSON.stringify(camp)},${JSON.stringify(early)}]}]`);
  const html = `<script>self.__next_f.push([1,${flight}])</script>`;
  expect(parseBoottentCamps(html).map(({ campId }) => campId)).toEqual(["codeitsprint-productdesign", "nobreak-dobong"]);
  const rows = await new BoottentSource(async () => html).fetch(AT);
  expect(rows[0]).toMatchObject({ kind: "bootcamp", title: "프로덕트 디자이너 과정 16기", deadlineOn: "2026-12-31", deadlinePrecision: "month", startsOn: "2026-12-29",
    tuition: 600_000, nbcardRequired: true, eligibility: "내일배움카드 발급자 대상 · 정규 훈련 시간 참여 가능자", homepageUrl: "https://sprint.codeit.kr/track/product-design?x=1",
    posterUrl: "https://cdn.sayun.studio/boottent/images/camps/top/header_ce8051a8.webp" });
  // 수업 시작일이 모집 시작일과 같으면(모집 일정이 들어간 값) 수업 시작일로 쓰지 않는다.
  expect(boottentRow(early, AT)).toMatchObject({ startsOn: null, tuition: 49_000 });
  expect(boottentDate("2026-02-30")).toEqual({ on: "2026-02-28", precision: "month" });
  await expect(new BoottentSource(async () => "<html></html>").fetch(AT)).rejects.toThrow("no camps");
});

it("콘테스트코리아: 상세 본문 머리의 그림만 포스터로 읽는다", () => {
  const html = `<div class="side"><img src="/admincenter/files/meet/[AB-2] 정보 모음[1].jpg" alt="" /></div>
    <div class="img_area">
<img src="/admincenter/files/meet/202610121605164029020.jpg" alt="2026 대구광역시 AI 활용대회">`;
  expect(contestKoreaPoster(html)).toBe("https://www.contestkorea.com/admincenter/files/meet/202610121605164029020.jpg");
  expect(contestKoreaPoster(`<img src="/admincenter/files/meet/banner.jpg" alt="">`)).toBeNull();
});

it("Dev-Event: 행사 페이지의 og:image를 속성 순서와 상관없이 읽는다", () => {
  expect(openGraphImage(`<meta property="og:image" content="https://static.onoffmix.com/a.jpg"/>`, "https://onoffmix.com/event/1")).toBe("https://static.onoffmix.com/a.jpg");
  expect(openGraphImage(`<meta content="/cover.png?a=1&amp;b=2" property="og:image">`, "https://luma.com/x")).toBe("https://luma.com/cover.png?a=1&b=2");
  expect(openGraphImage(`<meta property="og:image" content="javascript:alert(1)">`, "https://luma.com/x")).toBeNull();
  expect(openGraphImage("<html></html>", "https://luma.com/x")).toBeNull();
});
