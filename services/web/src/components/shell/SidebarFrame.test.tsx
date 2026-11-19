// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { SidebarCollapseProvider } from "./SidebarCollapse";
import { SidebarFrame } from "./SidebarFrame";

let stored: string | null = null;

beforeEach(() => {
  stored = null;
  vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  vi.stubGlobal("localStorage", { getItem: () => stored, setItem: vi.fn() });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function renderFrame(title?: string) {
  return render(
    <SidebarCollapseProvider>
      <SidebarFrame {...(title ? { title } : {})}>내용</SidebarFrame>
    </SidebarCollapseProvider>,
  );
}

it("제품 로고가 보이는 브랜드 줄은 홈으로 가는 링크다", () => {
  renderFrame();

  const logo = screen.getByRole("link", { name: "Expresso 홈" });
  expect(logo.getAttribute("href")).toBe("/home");
  expect(logo.getAttribute("tabindex")).toBeNull();
});

it("칸 이름을 보여 주는 브랜드 줄은 링크가 아니다", () => {
  renderFrame("대화와 자료");

  expect(screen.queryByRole("link")).toBeNull();
  expect(screen.getByText("대화와 자료")).toBeTruthy();
});

it("접힌 사이드바에서는 로고 링크가 Tab 순서와 보조 기술에서 빠진다", () => {
  stored = "true";
  const { container } = renderFrame();

  // 펴기 단추가 로고 자리를 대신하므로 링크는 숨겨진 채 남는다. 숨긴 요소는 이름을 계산하지 않아 주소로 찾는다.
  expect(screen.queryByRole("link")).toBeNull();
  const logo = container.querySelector('a[href="/home"]');
  if (!logo) throw new Error("로고 링크가 없다");
  expect(logo.getAttribute("tabindex")).toBe("-1");
  expect(logo.getAttribute("aria-hidden")).toBe("true");
  expect(screen.getByRole("button", { name: "사이드바 펼치기" })).toBeTruthy();
});
