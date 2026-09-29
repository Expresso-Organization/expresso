import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
  }),
  requireSession: vi.fn(async () => ({ accessToken: "test-session" })),
  startInterview: vi.fn(),
  createRecipe: vi.fn(),
  answer: vi.fn(),
  replaceQuestion: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/lib/require-session", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/lib/api/endpoints", () => ({
  brews: {
    startInterview: mocks.startInterview,
    createRecipe: mocks.createRecipe,
  },
  interview: {
    answer: mocks.answer,
    replaceQuestion: mocks.replaceQuestion,
  },
}));

import {
  answerQuestionAction,
  createRecipeAction,
  replaceQuestionAction,
  startInterviewAction,
} from "./brew-actions";

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

describe("Brew AI Interview MVP action gate", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ["start", startInterviewAction, { brewId: "brew-1" }],
    ["answer", answerQuestionAction, {
      brewId: "brew-1",
      sessionId: "session-1",
      questionId: "question-1",
      transcript: "답변",
    }],
    ["replace", replaceQuestionAction, {
      brewId: "brew-1",
      sessionId: "session-1",
      questionId: "question-1",
    }],
  ] as const)("%s mutation을 Fastify 호출 전에 차단한다", async (_name, action, values) => {
    await expect(action(form(values))).rejects.toThrow("404");

    expect(mocks.requireSession).not.toHaveBeenCalled();
    expect(mocks.startInterview).not.toHaveBeenCalled();
    expect(mocks.answer).not.toHaveBeenCalled();
    expect(mocks.replaceQuestion).not.toHaveBeenCalled();
  });

  it("일반 레시피 생성 action은 유지한다", async () => {
    await createRecipeAction(form({ brewId: "brew-1" }));

    expect(mocks.createRecipe).toHaveBeenCalledWith(
      "test-session",
      "brew-1",
      "recipe:brew-1",
    );
  });
});
