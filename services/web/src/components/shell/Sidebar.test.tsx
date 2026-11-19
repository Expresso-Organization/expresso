// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/home", useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
// 메뉴 · 최근 대화는 각자 테스트가 있다.
vi.mock("./SidebarNav", () => ({ SidebarNav: () => null }));
vi.mock("./SidebarConversations", () => ({ SidebarConversations: () => null }));

import type { CareerCategory } from "@expresso/contracts";

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

const category: CareerCategory = { id: "00000000-0000-4000-8000-000000000001", key: "experience", name: "경험", icon: "folder", defaultView: "table", propertySchemaV2: [], sortOrder: 0, recordCount: 3, version: 1, archivedAt: null, builtIn: true };

it("포트폴리오 · 커리어 기록 묶음이 서고 각 줄이 편집 화면과 카테고리 화면으로 간다", () => {
  render(
    <SidebarCollapseProvider>
      <Sidebar
        categories={[category]}
        portfolios={[
          { id: "p1", name: "토스 프론트엔드", href: "/edit/p1", meta: "작성 중 · 섹션 4개", status: "draft" },
          { id: "b1", name: "만들던 포트폴리오", href: "/brew/b1/design", meta: "만드는 중 · 디자인 선택", status: "draft" },
        ]}
        morePortfolios
        displayName="박민재"
        quotaUsed={0}
        quotaLimit={100}
      />
    </SidebarCollapseProvider>,
  );

  expect(screen.getByRole("button", { name: /포트폴리오/, expanded: true })).toBeTruthy();
  expect(screen.getByRole("button", { name: /커리어 기록/, expanded: true })).toBeTruthy();
  expect(screen.getByRole("link", { name: /토스 프론트엔드/ }).getAttribute("href")).toBe("/edit/p1");
  expect(screen.getByRole("link", { name: /만들던 포트폴리오/ }).getAttribute("href")).toBe("/brew/b1/design");
  expect(screen.getByRole("link", { name: /모두 보기/ }).getAttribute("href")).toBe("/library?s=portfolios");
  expect(screen.getByRole("link", { name: /경험/ }).getAttribute("href")).toBe("/career/experience");
});

it("포트폴리오가 없으면 포트폴리오 묶음을 세우지 않는다", () => {
  render(
    <SidebarCollapseProvider>
      <Sidebar categories={[category]} displayName="박민재" quotaUsed={0} quotaLimit={100} />
    </SidebarCollapseProvider>,
  );
  expect(screen.queryByRole("button", { name: /^포트폴리오/ })).toBeNull();
});
