// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const usePathname = vi.hoisted(() => vi.fn(() => "/jobs"));
vi.mock("next/navigation", () => ({ usePathname }));

import { SidebarInterests } from "./SidebarInterests";

const TOSS = "6f1c2f8e-2d7a-4b8e-9a51-0c3d6e9b7a10";
const DAANGN = "0b7d1c3a-5e2f-4a6b-8c9d-1e2f3a4b5c6d";

const interests = [
  { id: TOSS, initial: "T", company: "토스", logoUrl: null, label: "토스 · 백엔드", score: 92 },
  { id: DAANGN, initial: "D", company: "당근", logoUrl: null, label: "당근 · 서버", score: null },
];

afterEach(() => {
  cleanup();
  usePathname.mockReset();
});

it("줄마다 그 공고 상세로 가고, 목록 조건(from)을 달지 않는다", () => {
  usePathname.mockReturnValue("/jobs");
  render(<SidebarInterests interests={interests} />);

  expect(screen.getByRole("link", { name: /토스 · 백엔드/ }).getAttribute("href")).toBe(`/jobs/${TOSS}`);
  expect(screen.getByRole("link", { name: /당근 · 서버/ }).getAttribute("href")).toBe(`/jobs/${DAANGN}`);
  expect(screen.getByText("분석 대기")).toBeTruthy();
});

it("보고 있는 공고의 줄만 켜진다", () => {
  usePathname.mockReturnValue(`/jobs/${DAANGN}`);
  render(<SidebarInterests interests={interests} />);

  expect(screen.getByRole("link", { name: /당근 · 서버/ }).getAttribute("aria-current")).toBe("page");
  expect(screen.getByRole("link", { name: /토스 · 백엔드/ }).getAttribute("aria-current")).toBeNull();
});
