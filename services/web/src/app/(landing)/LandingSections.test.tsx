// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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
  // jsdom에는 화면 갱신 주기가 없다. 다음 마이크로태스크에 한 번 부른다.
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    queueMicrotask(() => callback(0));
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
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

it("앵커는 같은 페이지의 서비스 소개 · 제품 화면 · 포트폴리오 예시로 간다", () => {
  const { container } = render(<Landing />);
  const nav = screen.getByRole("navigation", { name: "소개" });
  for (const [name, id] of [["서비스 소개", "story"], ["제품 화면", "flow"], ["포트폴리오 예시", "showcase"]] as const) {
    expect(within(nav).getByRole("link", { name }).getAttribute("href")).toBe(`#${id}`);
    expect(container.querySelector(`#${id}`)).not.toBeNull();
  }
});

it("제품 화면에서 단계를 누르면 그 단계의 화면이 보인다", () => {
  render(<Landing />);
  const tabs = within(screen.getByRole("tablist", { name: "제품 화면" })).getAllByRole("tab");
  expect(tabs.map((tab) => tab.querySelector("span:nth-child(2)")?.textContent)).toEqual([
    "재료 고르기", "디자인 선택", "다듬기", "배포",
  ]);
  expect(tabs[0]?.getAttribute("aria-selected")).toBe("true");
  fireEvent.click(tabs[2]!);
  expect(tabs[2]?.getAttribute("aria-selected")).toBe("true");
  const panel = document.getElementById(tabs[2]!.getAttribute("aria-controls")!);
  expect(panel?.getAttribute("data-active")).toBe("true");
  expect(within(panel!).getByAltText(/편집기 화면/)).toBeTruthy();
});

it("소개 모션그래픽은 여섯 장을 순서대로 담는다", () => {
  render(<Landing />);
  const story = screen.getByRole("region", { name: "Expresso 소개" });
  expect(within(story).getAllByRole("heading", { level: 2, hidden: true }).map((heading) => heading.textContent)).toEqual([
    "기록을 쌓아 둡니다",
    "공고에서 요건을 뽑습니다",
    "비어 있는 요건은 물어봅니다",
    "공고에 맞춰 다시 고릅니다",
    "포트폴리오를 추출합니다",
    "링크 하나로 보냅니다",
  ]);
  const index = within(story).getByRole("list", { name: "소개 순서" });
  expect(within(index).getAllByRole("listitem").map((row) => row.textContent)).toEqual([
    "커리어 기록", "공고 분석", "AI 대화", "기업 맞춤", "포트폴리오 추출", "배포 · 방문 분석",
  ]);
});

it("스크롤 위치에 따라 지금 장이 바뀌고, 되돌리면 앞 장으로 돌아간다", async () => {
  render(<Landing />);
  const story = screen.getByRole("region", { name: "Expresso 소개" });
  const rows = within(within(story).getByRole("list", { name: "소개 순서" })).getAllByRole("listitem");
  const panels = within(story).getAllByRole("heading", { level: 2, hidden: true }).map((heading) => heading.closest("div")!.parentElement!);
  const height = 10_000;
  const travel = height - window.innerHeight;
  const scrollTo = async (progress: number) => {
    story.getBoundingClientRect = () => ({ top: -progress * travel, height }) as DOMRect;
    await act(async () => {
      window.dispatchEvent(new Event("scroll"));
      await Promise.resolve();
    });
  };
  const states = () => rows.map((row) => row.getAttribute("data-state"));
  const visible = () => panels.map((panel) => panel.style.visibility === "visible");

  // 도입부 0.1 뒤로 여섯 장이 0.145씩 차지한다. 0.61은 넷째 장(기업 맞춤)의 가운데다.
  await scrollTo(0.61);
  expect(states()).toEqual(["done", "done", "done", "active", "todo", "todo"]);
  expect(visible()).toEqual([false, false, false, true, false, false]);
  // 첫 화면 글이 사라진 뒤에는 그 회원가입 · 로그인이 탭 순서에서 빠진다. 머리 메뉴 · 마지막 권유만 남는다.
  expect(screen.getAllByRole("link", { name: "회원가입" })).toHaveLength(2);

  await scrollTo(0.17);
  expect(states()).toEqual(["active", "todo", "todo", "todo", "todo", "todo"]);
  expect(visible()).toEqual([true, false, false, false, false, false]);
});

it("스크롤을 장 가운데에서 멈춰도 장면은 시간에 따라 끝까지 재생된다", async () => {
  // 동작 줄이기를 끄고, 화면 갱신을 손으로 한 프레임(16ms)씩 넘긴다.
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  let queue: FrameRequestCallback[] = [];
  let now = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    queue.push(callback);
    return queue.length;
  });
  const frames = (count: number) => {
    for (let index = 0; index < count && queue.length > 0; index += 1) {
      const pending = queue;
      queue = [];
      now += 16;
      act(() => pending.forEach((callback) => callback(now)));
    }
  };

  render(<Landing />);
  const story = screen.getByRole("region", { name: "Expresso 소개" });
  const panel = within(story).getAllByRole("heading", { level: 2, hidden: true })[1]!.closest("div")!.parentElement!;
  const height = 10_000;
  story.getBoundingClientRect = () => ({ top: -0.3 * (height - window.innerHeight), height }) as DOMRect;
  act(() => {
    window.dispatchEvent(new Event("scroll"));
  });

  // 0.3은 둘째 장(공고 분석) 구간의 앞쪽이다. 스크롤은 여기서 멈추고 시간만 흐른다.
  frames(20);
  const midway = Number(panel.style.getPropertyValue("--t"));
  expect(midway).toBeGreaterThan(0);
  expect(midway).toBeLessThan(1);

  frames(200);
  expect(panel.style.getPropertyValue("--t")).toBe("1.0000");
  expect(panel.style.getPropertyValue("--v")).toBe("1.0000");
  // 마크 수위는 이 장의 끝 수위(42%)에 닿는다.
  expect(within(story).getByText("42%")).toBeTruthy();
  expect(queue).toHaveLength(0);
});
