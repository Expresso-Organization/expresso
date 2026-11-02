// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { Landing } from "./LandingSections";

afterEach(cleanup);

it("머리 메뉴 · 첫 화면 · 마지막 권유 세 자리에 회원가입과 로그인이 함께 있다", () => {
  render(<Landing />);
  const signups = screen.getAllByRole("link", { name: "회원가입" });
  const logins = screen.getAllByRole("link", { name: "로그인" });
  expect(signups).toHaveLength(3);
  expect(logins).toHaveLength(3);
  for (const link of signups) expect(link.getAttribute("href")).toBe("/signup");
  for (const link of logins) expect(link.getAttribute("href")).toBe("/login");
  // 머리 메뉴에도 한 쌍이 있어 어느 위치에서든 로그인할 수 있다.
  const header = screen.getByRole("banner");
  expect(within(header).getByRole("link", { name: "회원가입" })).toBeTruthy();
  expect(within(header).getByRole("link", { name: "로그인" })).toBeTruthy();
});

it("굴러가는 단어는 가리고 머리글을 한 문장으로 읽힌다", () => {
  render(<Landing />);
  // 접근성 이름은 aria-hidden 안쪽을 빼고 계산한다 — 굴림 단어 넷이 섞이면 이름이 달라진다.
  const heading = screen.getByRole("heading", { level: 1, name: "Express your work." });
  const visual = heading.querySelector('[aria-hidden="true"]');
  expect(visual?.textContent).toContain("idea.");
});

it("앵커는 같은 페이지의 만드는 순서 · 기업 맞춤 구획으로 간다", () => {
  const { container } = render(<Landing />);
  expect(container.querySelector("#flow")).not.toBeNull();
  expect(container.querySelector("#tailor")).not.toBeNull();
  const nav = screen.getByRole("navigation", { name: "소개" });
  expect(within(nav).getByRole("link", { name: "만드는 순서" }).getAttribute("href")).toBe("#flow");
  expect(within(nav).getByRole("link", { name: "기업 맞춤" }).getAttribute("href")).toBe("#tailor");
});
