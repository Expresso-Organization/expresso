// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { HomeInsights } from "./HomeInsights";
import type { SiteInsight } from "./home-model";

const site = (over: Partial<SiteInsight>): SiteInsight => ({
  portfolioId: "6f1c2f8e-2d7a-4b8e-9a51-0c3d6e9b7a10",
  subdomain: "harin",
  version: 1,
  publishedOn: "2026-10-31",
  visits: 12,
  completes: 4,
  contactClicks: 1,
  days: [
    { date: "2026-10-31", visits: 5, contactClicks: 0 },
    { date: "2026-11-01", visits: 7, contactClicks: 1 },
  ],
  sections: [{ sectionId: "0b7d1c3a-5e2f-4a6b-8c9d-1e2f3a4b5c6d", title: "소개", position: 1, views: 10, dwellMs: 30_000 }],
  referrers: [{ origin: "https://www.linkedin.com", visits: 4 }],
  ...over,
});

let reduced = false;

beforeEach(() => {
  reduced = false;
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("reduce") ? reduced : false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const selected = () => screen.getByRole("tab", { selected: true }).textContent;

it("섹션 조회와 유입이 있으면 세 차트를 단추로 고른다", () => {
  render(<HomeInsights sites={[site({})]} />);
  expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["지원 반응", "섹션 체류", "유입 경로"]);
  fireEvent.click(screen.getByRole("tab", { name: /유입 경로/ }));
  expect(selected()).toBe("유입 경로");
});

it("그릴 것이 지원 반응뿐이면 단추 없이 제목만 선다", () => {
  render(<HomeInsights sites={[site({ sections: [], referrers: [] })]} />);
  expect(screen.queryByRole("tablist")).toBeNull();
  expect(screen.getByText("지원 반응")).toBeTruthy();
});

it("남은 시간 막대가 다 차면 다음 차트로, 포인터가 카드 안에 있으면 멈춘다", () => {
  const { container } = render(<HomeInsights sites={[site({})]} />);
  const bar = () => container.querySelector<HTMLElement>("[class*='rotateBar']")!;
  expect(bar().style.animationPlayState).toBe("running");

  fireEvent.animationEnd(bar());
  expect(selected()).toBe("섹션 체류");

  fireEvent.pointerEnter(container.firstElementChild!);
  expect(bar().style.animationPlayState).toBe("paused");
  fireEvent.pointerLeave(container.firstElementChild!);
  expect(bar().style.animationPlayState).toBe("running");
});

it("움직임을 줄이도록 설정했으면 넘기지 않는다", () => {
  reduced = true;
  const { container } = render(<HomeInsights sites={[site({})]} />);
  expect(container.querySelector("[class*='rotateBar']")).toBeNull();
});
