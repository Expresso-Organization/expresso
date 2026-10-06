import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
  requireSession: vi.fn(async () => ({ accessToken: "test-session" })),
  getBrew: vi.fn(async () => ({
    data: {
      interviewSessionId: null,
      latestJob: null,
      materials: { selected: 0 },
      posting: null,
    },
  })),
}));

vi.mock("next/navigation", () => ({
  notFound: vi.fn(),
  redirect: mocks.redirect,
}));
vi.mock("@/lib/require-session", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/lib/api/endpoints", () => ({
  brews: { get: mocks.getBrew },
  interview: { session: vi.fn() },
}));

import CounterPage from "./page";

describe("Brew AI Interview MVP route gate", () => {
  beforeEach(() => vi.clearAllMocks());

  it("직접 접근도 레시피 화면으로 돌리고 Fastify를 읽지 않는다", async () => {
    await expect(CounterPage({ params: Promise.resolve({ brewId: "brew-1" }) }))
      .rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.redirect).toHaveBeenCalledWith("/brew/brew-1/outline");
    expect(mocks.requireSession).not.toHaveBeenCalled();
    expect(mocks.getBrew).not.toHaveBeenCalled();
  });
});
