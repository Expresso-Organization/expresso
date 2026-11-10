// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/home", useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
// 크레딧 카드만 본다. 메뉴 · 분류 목록은 각자 테스트가 있다.
vi.mock("./SidebarNav", () => ({ SidebarNav: () => null }));
vi.mock("./SidebarCategories", () => ({ SidebarCategories: () => null }));

import { Sidebar } from "./Sidebar";
import { SidebarCollapseProvider } from "./SidebarCollapse";

beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("크레딧 카드는 설정 화면의 사용량 구획으로 가는 링크이고 게이지를 품는다", () => {
  render(
    <SidebarCollapseProvider>
      <Sidebar categories={[]} displayName="박민재" quotaUsed={4} quotaLimit={100} />
    </SidebarCollapseProvider>,
  );

  const card = screen.getByRole("link", { name: /이번 달 크레딧/ });
  expect(card.getAttribute("href")).toBe("/account#usage");
  expect(card.contains(screen.getByRole("meter"))).toBe(true);
});
