import { beforeEach, describe, expect, it, vi } from "vitest";

const createRecipe = vi.hoisted(() => vi.fn());
const startInterview = vi.hoisted(() => vi.fn());
const redirect = vi.hoisted(() => vi.fn());
const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/require-session", () => ({ requireSession: async () => ({ accessToken: "test-session" }) }));
vi.mock("@/lib/api/endpoints", () => ({ brews: { createRecipe, startInterview }, interview: {} }));

import { beginInterviewAction, continueToDesignAction } from "./brew-actions";

const BREW = "6f1d7f0e-3c2a-4b9e-8d11-2a7c5b9e0a01";

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

describe("AI 대화에서 디자인 선택으로", () => {
  beforeEach(() => {
    createRecipe.mockReset();
    redirect.mockReset();
  });

  it("구성 잡을 브루마다 같은 키로 맡기고 디자인 선택으로 간다 — 레시피 화면을 거치지 않는다", async () => {
    await continueToDesignAction(form({ brewId: BREW }));
    expect(createRecipe).toHaveBeenCalledWith("test-session", BREW, `recipe:${BREW}`);
    expect(redirect).toHaveBeenCalledWith(`/brew/${BREW}/design`);
    expect(revalidatePath).not.toHaveBeenCalledWith(`/brew/${BREW}/outline`);
  });

  it("브루가 없으면 아무것도 하지 않는다", async () => {
    await continueToDesignAction(form({}));
    expect(createRecipe).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("재료 화면에서 AI 대화로", () => {
  const FAILED_JOB = "0b5c2d4e-1f3a-4c6b-9d8e-7a6b5c4d3e2f";

  beforeEach(() => {
    startInterview.mockReset();
    redirect.mockReset();
  });

  it("질문 잡을 맡기고 곧바로 대화 화면으로 간다 — 「질문 만들기」를 다시 누르지 않는다", async () => {
    await beginInterviewAction(form({ brewId: BREW }));
    expect(startInterview).toHaveBeenCalledWith("test-session", BREW, `interview:${BREW}`);
    expect(redirect).toHaveBeenCalledWith(`/brew/${BREW}/counter`);
  });

  it("마지막으로 본 잡을 키에 붙인다 — 거절된 뒤 재료를 고쳐 다시 시작하면 새 잡이 돈다", async () => {
    await beginInterviewAction(form({ brewId: BREW, basisJobId: FAILED_JOB }));
    expect(startInterview).toHaveBeenCalledWith("test-session", BREW, `interview:${BREW}:${FAILED_JOB}`);
  });

  it("브루가 없으면 아무것도 하지 않는다", async () => {
    await beginInterviewAction(form({}));
    expect(startInterview).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });
});
