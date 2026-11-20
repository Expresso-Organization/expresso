import { expect, it } from "vitest";

import { sectionForPath } from "./SidebarNav";

it("설정 화면은 1차 메뉴의 어느 항목도 활성으로 만들지 않는다", () => {
  expect(sectionForPath("/account")).toBeNull();
  expect(sectionForPath("/account/billing")).toBeNull();
});

it("홈과 나머지 1차 메뉴는 주소로 활성 항목을 정한다", () => {
  expect(sectionForPath("/home")).toBe("home");
  expect(sectionForPath("/jobs/abc")).toBe("explore");
  expect(sectionForPath("/analytics")).toBe("analytics");
});

it("에이전트 대화는 홈이고, 기록과 포트폴리오는 어디서 열었든 라이브러리다", () => {
  expect(sectionForPath("/agent")).toBe("home");
  expect(sectionForPath("/library")).toBe("library");
  expect(sectionForPath("/career/project")).toBe("library");
  expect(sectionForPath("/edit/abc")).toBe("library");
});

it("새 포트폴리오 제작은 탭이 아니라 버튼이라 어느 탭도 활성으로 만들지 않는다", () => {
  expect(sectionForPath("/brew/new")).toBeNull();
});
