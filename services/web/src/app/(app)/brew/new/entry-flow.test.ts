import { beforeEach, describe, expect, it, vi } from "vitest";

const redirect = vi.hoisted(() =>
  vi.fn((to: string) => {
    throw new Error(`redirect:${to}`);
  }),
);
const createFree = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/require-session", () => ({ requireSession: async () => ({ accessToken: "test-session" }) }));
vi.mock("@/lib/api/endpoints", () => ({ brews: { createFree }, jobs: {}, jobAnalyses: {} }));

import NewPortfolioPage from "../../portfolio/new/page";
import { createFreeBrewAction } from "./new-brew-actions";

/** "새 포트폴리오"는 공고 고르기에서 시작하고, 목표 없이 시작해도 공고 분석 단계부터 연다. */
describe("제작 흐름 입구", () => {
  beforeEach(() => {
    redirect.mockClear();
    createFree.mockReset();
  });

  it("이전 새 포트폴리오 주소는 브루를 만들지 않고 공고 고르기로 보낸다", () => {
    expect(() => NewPortfolioPage()).toThrow("redirect:/brew/new");
    expect(createFree).not.toHaveBeenCalled();
  });

  it("목표 없이 만든 제작은 공고 분석 단계에서 시작한다", async () => {
    createFree.mockResolvedValue({ data: { brewId: "brew-1" } });
    const form = new FormData();
    form.set("title", "가상 포트폴리오");
    form.set("brief", "경로 연구를 담습니다");
    await expect(createFreeBrewAction({ error: null }, form)).rejects.toThrow("redirect:/brew/brew-1/analyze");
  });
});
