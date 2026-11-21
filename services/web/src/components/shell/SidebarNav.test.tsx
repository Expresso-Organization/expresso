// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/jobs" }));

import { SidebarNav } from "./SidebarNav";

afterEach(cleanup);

it("1차 메뉴에 검색 줄 없이 새 포트폴리오와 네 메뉴만 선다", () => {
  render(<SidebarNav />);

  // 검색은 머리글의 검색 단추와 ⌘K가 연다.
  expect(screen.queryByRole("button", { name: /검색/ })).toBeNull();
  expect(screen.queryByText("⌘K")).toBeNull();
  expect(screen.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
    "/home?new=portfolio",
    "/home",
    "/library",
    "/jobs",
    "/analytics",
  ]);
  expect(screen.getByRole("link", { name: "탐색" }).getAttribute("aria-current")).toBe("page");
});
