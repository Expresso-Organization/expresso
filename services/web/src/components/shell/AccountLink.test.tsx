// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const pathname = vi.hoisted(() => ({ value: "/home" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.value }));

import { AccountLink } from "./AccountLink";

afterEach(cleanup);

it("설정 화면에서는 사용자 줄이 현재 위치로 표시된다", () => {
  pathname.value = "/account";
  render(<AccountLink title="설정">이름</AccountLink>);
  const link = screen.getByRole("link", { name: "이름" });
  expect(link.getAttribute("aria-current")).toBe("page");
  expect(link.className).toContain("rowActive");
});

it("설정 하위 경로에서도 현재 위치로 표시된다", () => {
  pathname.value = "/account/billing";
  render(<AccountLink title="설정">이름</AccountLink>);
  expect(screen.getByRole("link").getAttribute("aria-current")).toBe("page");
});

it("다른 화면에서는 현재 위치로 표시되지 않는다", () => {
  pathname.value = "/home";
  render(<AccountLink title="설정">이름</AccountLink>);
  const link = screen.getByRole("link");
  expect(link.getAttribute("aria-current")).toBeNull();
  expect(link.className).not.toContain("rowActive");
});
