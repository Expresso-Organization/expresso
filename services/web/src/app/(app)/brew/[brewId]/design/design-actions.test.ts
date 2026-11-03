import { beforeEach, describe, expect, it, vi } from "vitest";

const submit = vi.hoisted(() => vi.fn());
const select = vi.hoisted(() => vi.fn());
const createRecipe = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const redirect = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/require-session", () => ({ requireSession: async () => ({ accessToken: "test-session" }) }));
vi.mock("@/lib/api/endpoints", () => ({ generation: { submit }, designSystems: { select }, brews: { createRecipe } }));

import { ApiError } from "@/lib/api/client";

import { startGenerationAction } from "./design-actions";

const BREW = "6f1d7f0e-3c2a-4b9e-8d11-2a7c5b9e0a01";
const RECIPE = "6f1d7f0e-3c2a-4b9e-8d11-2a7c5b9e0a02";
const REVISION = "5d8f5f2d-6d2a-4f24-9d1a-2b8f9e7c1702";

function form(values: Record<string, string> = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    brewId: BREW, recipeId: RECIPE, designSystemRevisionId: REVISION, ...values,
  })) data.set(key, value);
  return data;
}

describe("디자인 시스템으로 생성 요청", () => {
  beforeEach(() => {
    submit.mockReset();
    select.mockReset();
    createRecipe.mockReset();
  });

  it("고른 페이지 짜임새를 생성 요청에 함께 보낸다", async () => {
    expect(await startGenerationAction({ error: null }, form({ archetype: "poster" }))).toEqual({ error: null });
    expect(submit).toHaveBeenCalledWith("test-session", { recipeId: RECIPE, designSystemRevisionId: REVISION, archetype: "poster" }, expect.any(String));
  });

  it("알 수 없는 짜임새 값이면 생성을 요청하지 않는다", async () => {
    const result = await startGenerationAction({ error: null }, form({ archetype: "magazine" }));
    expect(result.error).toBeTruthy();
    expect(submit).not.toHaveBeenCalled();
  });

  it("고른 디자인을 저장한 뒤 그 판으로 생성을 요청한다", async () => {
    const order: string[] = [];
    select.mockImplementation(async () => { order.push("select"); });
    submit.mockImplementation(async () => { order.push("submit"); });
    expect(await startGenerationAction({ error: null }, form())).toEqual({ error: null });
    expect(select).toHaveBeenCalledWith("test-session", BREW, { revisionId: REVISION });
    expect(submit).toHaveBeenCalledWith(
      "test-session",
      { recipeId: RECIPE, designSystemRevisionId: REVISION },
      expect.any(String),
    );
    expect(order).toEqual(["select", "submit"]);
    // 다시 뽑기에서 시작했어도 기다림 화면 주소로 옮겨, 끝난 뒤 카탈로그가 다시 열리지 않습니다.
    expect(redirect).toHaveBeenCalledWith(`/brew/${BREW}/design`);
  });

  it("구성이 아직이면 구성 잡을 먼저 맡기고 브루로 생성을 요청한다", async () => {
    const order: string[] = [];
    createRecipe.mockImplementation(async () => { order.push("recipe"); });
    submit.mockImplementation(async () => { order.push("submit"); });
    expect(await startGenerationAction({ error: null }, form({ recipeId: "" }))).toEqual({ error: null });
    expect(createRecipe).toHaveBeenCalledWith("test-session", BREW, `recipe:${BREW}`);
    expect(submit).toHaveBeenCalledWith("test-session", { brewId: BREW, designSystemRevisionId: REVISION }, expect.any(String));
    expect(order).toEqual(["recipe", "submit"]);
  });

  it("구성이 있으면 구성 잡을 다시 맡기지 않는다", async () => {
    await startGenerationAction({ error: null }, form());
    expect(createRecipe).not.toHaveBeenCalled();
  });

  it("구성이나 디자인 ID가 올바르지 않으면 요청하지 않는다", async () => {
    expect((await startGenerationAction({ error: null }, form({ recipeId: "x" }))).error).toBeTruthy();
    expect((await startGenerationAction({ error: null }, form({ designSystemRevisionId: "x" }))).error).toBeTruthy();
    expect(select).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });

  it("생성 한도를 넘으면 한도 문구를 돌려준다", async () => {
    submit.mockRejectedValue(new ApiError({ status: 402, code: "FORBIDDEN", message: "limit", requestId: "test" }));
    const result = await startGenerationAction({ error: null }, form());
    expect(result.error).toContain("크레딧");
  });
});
