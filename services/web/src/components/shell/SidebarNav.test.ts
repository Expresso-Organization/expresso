import { expect, it } from "vitest";

import { sectionForPath } from "./SidebarNav";

it("설정 화면은 1차 메뉴의 어느 항목도 활성으로 만들지 않는다", () => {
  expect(sectionForPath("/account")).toBeNull();
  expect(sectionForPath("/account/billing")).toBeNull();
});

it("홈과 나머지 1차 메뉴는 주소로 활성 항목을 정한다", () => {
  expect(sectionForPath("/home")).toBe("home");
  expect(sectionForPath("/jobs/abc")).toBe("jobs");
  expect(sectionForPath("/agent")).toBe("agent");
  expect(sectionForPath("/brew/new")).toBe("new-portfolio");
});
