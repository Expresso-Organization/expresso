// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

// next/image의 최적화는 Next 서버가 한다. 여기서는 대체 글만 확인한다.
vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => <img alt={alt} />,
}));

import { Landing } from "./LandingSections";

beforeEach(() => {
  // 동작 줄이기로 둔다 — 둘러보기가 저절로 넘어가지 않고 등장 효과도 걸리지 않는다.
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("reduce"),
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("머리 메뉴 · 첫 화면 · 마지막 권유 세 곳에 회원가입과 로그인이 함께 있다", () => {
  render(<Landing />);
  const signups = screen.getAllByRole("link", { name: "회원가입" });
  const logins = screen.getAllByRole("link", { name: "로그인" });
  expect(signups).toHaveLength(3);
  expect(logins).toHaveLength(3);
  for (const link of signups) expect(link.getAttribute("href")).toBe("/signup");
  for (const link of logins) expect(link.getAttribute("href")).toBe("/login");
  const header = screen.getByRole("banner");
  expect(within(header).getByRole("link", { name: "회원가입" })).toBeTruthy();
  expect(within(header).getByRole("link", { name: "로그인" })).toBeTruthy();
});

it("굴러가는 단어는 가리고 머리글을 한 문장으로 읽힌다", () => {
  render(<Landing />);
  // 접근성 이름은 aria-hidden 안쪽을 빼고 계산한다 — 굴림 단어 넷이 섞이면 이름이 달라진다.
  const heading = screen.getByRole("heading", { level: 1, name: "Express your work." });
  expect(heading.querySelector('[aria-hidden="true"]')?.textContent).toContain("idea.");
});

it("앵커는 같은 페이지의 제작 과정 · 기업 맞춤 · 포트폴리오 예시로 간다", () => {
  const { container } = render(<Landing />);
  const nav = screen.getByRole("navigation", { name: "소개" });
  for (const [name, id] of [["제작 과정", "flow"], ["기업 맞춤", "tailor"], ["포트폴리오 예시", "showcase"]] as const) {
    expect(within(nav).getByRole("link", { name }).getAttribute("href")).toBe(`#${id}`);
    expect(container.querySelector(`#${id}`)).not.toBeNull();
  }
});

it("제작 과정에서 단계를 누르면 그 단계의 화면이 보인다", () => {
  render(<Landing />);
  const tabs = within(screen.getByRole("tablist", { name: "제작 과정" })).getAllByRole("tab");
  expect(tabs.map((tab) => tab.querySelector("span:nth-child(2)")?.textContent)).toEqual([
    "공고 분석", "재료 고르기", "AI 대화", "디자인 선택", "다듬기", "배포",
  ]);
  expect(tabs[0]?.getAttribute("aria-selected")).toBe("true");
  fireEvent.click(tabs[4]!);
  expect(tabs[4]?.getAttribute("aria-selected")).toBe("true");
  const panel = document.getElementById(tabs[4]!.getAttribute("aria-controls")!);
  expect(panel?.getAttribute("data-active")).toBe("true");
  expect(within(panel!).getByAltText(/편집기 화면/)).toBeTruthy();
});

it("기업 맞춤에서 공고를 바꾸면 기록의 순위가 바뀐다", () => {
  render(<Landing />);
  const list = screen.getByRole("list", { name: "공고에 맞춘 기록 순서" });
  const rank = (title: RegExp) => within(list).getByText(title).closest("li")?.getAttribute("aria-posinset");
  expect(rank(/App Router 전환/)).toBe("1");
  fireEvent.click(screen.getByRole("tab", { name: "디자인 시스템 엔지니어" }));
  expect(rank(/모아 UI/)).toBe("1");
  expect(rank(/App Router 전환/)).toBe("4");
});
