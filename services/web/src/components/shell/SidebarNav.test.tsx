// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { AGENT_CHAT_CLOSE, AGENT_COMPOSER_FOCUS } from "@/features/agent-chat/agent-handoff";

const navigation = vi.hoisted(() => ({ pathname: "/jobs", push: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: navigation.push }),
}));

import { SidebarNav } from "./SidebarNav";

afterEach(() => {
  cleanup();
  navigation.pathname = "/jobs";
  navigation.push.mockReset();
  window.history.replaceState(null, "", "/");
});

/** 주소를 바꾸고 사이드바를 그린 뒤 「새 대화」를 누른다. 기본 동작이 막혔는지를 돌려준다. */
function clickNewChat(url: string) {
  const [pathname] = url.split("?");
  navigation.pathname = pathname!;
  window.history.replaceState(null, "", url);
  render(<SidebarNav />);
  return !fireEvent.click(screen.getByRole("link", { name: "새 대화" }));
}

it("1차 메뉴에 검색 줄 없이 새 포트폴리오 · 새 대화와 네 메뉴만 선다", () => {
  render(<SidebarNav />);

  // 검색은 머리글의 검색 단추와 ⌘K가 연다.
  expect(screen.queryByRole("button", { name: /검색/ })).toBeNull();
  expect(screen.queryByText("⌘K")).toBeNull();
  expect(screen.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
    "/home?new=portfolio",
    "/home",
    "/home",
    "/library",
    "/jobs",
    "/analytics",
  ]);
  expect(screen.getByRole("link", { name: "탐색" }).getAttribute("aria-current")).toBe("page");
});

it("홈에서 대화 중에 새 대화를 누르면 대화 화면의 새 대화와 같은 전환으로 홈에 돌아간다", () => {
  for (const url of ["/home?chat=abc", "/home?compose=1", "/home?new=portfolio"]) {
    expect(clickNewChat(url)).toBe(true);
    expect(navigation.push).toHaveBeenLastCalledWith("/home", { transitionTypes: [AGENT_CHAT_CLOSE] });
    cleanup();
  }
});

it("대화 전 홈에서 새 대화를 누르면 이동하지 않고 입력창 초점을 요청한다", () => {
  const focus = vi.fn();
  window.addEventListener(AGENT_COMPOSER_FOCUS, focus);

  expect(clickNewChat("/home")).toBe(true);
  expect(focus).toHaveBeenCalledOnce();
  expect(navigation.push).not.toHaveBeenCalled();

  window.removeEventListener(AGENT_COMPOSER_FOCUS, focus);
});

it("다른 화면에서는 새 대화가 평범한 링크로 홈에 간다", () => {
  expect(clickNewChat("/jobs")).toBe(false);
  expect(navigation.push).not.toHaveBeenCalled();
});

it("수정키를 누른 채 누르면 새 탭으로 여는 브라우저 동작에 맡긴다", () => {
  navigation.pathname = "/home";
  window.history.replaceState(null, "", "/home?chat=abc");
  render(<SidebarNav />);

  expect(fireEvent.click(screen.getByRole("link", { name: "새 대화" }), { metaKey: true })).toBe(true);
  expect(navigation.push).not.toHaveBeenCalled();
});
