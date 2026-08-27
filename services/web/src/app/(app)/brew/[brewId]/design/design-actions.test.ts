import { beforeEach, describe, expect, it, vi } from "vitest";

const submit = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/require-session", () => ({ requireSession: async () => ({ accessToken: "test-session" }) }));
vi.mock("@/lib/api/endpoints", () => ({ generation: { submit } }));

import { startGenerationAction } from "./design-actions";

function form() {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    brewId: "brew", recipeId: "recipe", templateId: "terminal",
    structure: "dense-grid", density: "spacious", font: "mono",
    background: "#101010", text: "#ffffff", accent: "#f7931a",
  })) data.set(key, value);
  return data;
}

describe("디자인 생성 요청", () => {
  beforeEach(() => submit.mockReset());

  it("선택한 고정폭 서체와 화면의 팔레트를 함께 전달한다", async () => {
    expect(await startGenerationAction({ error: null }, form())).toEqual({ error: null });
    expect(submit).toHaveBeenCalledWith("test-session", {
      recipeId: "recipe", templateId: "terminal",
      styleOverrides: {
        structure: "dense-grid", density: "spacious", font: "mono",
        background: "#101010", text: "#ffffff", accent: "#f7931a",
      },
    }, expect.any(String));
  });

  it.each([ ["font", "invalid"], ["accent", "url(https://example.com)"] ])(
    "잘못된 %s 값은 생성 전에 차단한다", async (field, value) => {
      const data = form();
      data.set(field, value);
      expect((await startGenerationAction({ error: null }, data)).error).toBeTruthy();
      expect(submit).not.toHaveBeenCalled();
    },
  );
});
