// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BrewGenerationCardData } from "@/lib/brew-generation-card";
import { BrewGenerationCard } from "./BrewGenerationCard";
import { DesignBrews } from "./design-brews";

// 서버 액션은 이 테스트가 보는 것이 아니다. 무엇이 불렸는지만 본다.
const cancel = vi.fn(async (_id: string) => ({ error: null as string | null }));
// 기다림 그림은 구성을 기다리는 동안 화면을 다시 읽는다(`useRefreshWhile`). 라우터는 이 테스트가 보는 것이 아니다.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/(app)/brew/[brewId]/design/design-actions", () => ({ ensureRecipeAction: vi.fn(), startGenerationAction: vi.fn(), cancelGenerationInChatAction: (id: string) => cancel(id) }));

const brewId = "00000000-0000-4000-8000-000000000001";
const generationId = "00000000-0000-4000-8000-000000000070";
const portfolioId = "00000000-0000-4000-8000-000000000080";
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
const reading = { posting: null, design: null, sections: [], records: [{ recordId: "00000000-0000-4000-8000-000000000090", title: "결제 화면 성능 개선", categoryIcon: "briefcase", categoryName: "프로젝트", reason: "요건과 겹침" }] };
const generation = (status: "queued" | "running" | "done" | "failed", extra: Partial<NonNullable<BrewGenerationCardData["generation"]>> = {}): BrewGenerationCardData => ({
  generation: { id: generationId, status, createdAt: new Date().toISOString(), portfolioId: null, failureCode: null, ...extra },
  recipePending: false, title: "커머스 프론트엔드", reading: status === "queued" || status === "running" ? reading : null,
});

function serve(data: BrewGenerationCardData) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.startsWith(`/api/brews/${brewId}/generation`)) return json({ data });
    if (url === `/api/brews/${brewId}/design-card`) return json({ data: { recipeId: brewId, recipeBuilding: false, recipeFailure: null, generationAllowed: true, generating: false, portfolioId: null } });
    if (url.startsWith(`/api/brews/${brewId}/design-chat`)) return json({ data: { chat: null, unchanged: false } });
    throw new Error(`예상하지 못한 요청 ${url}`);
  }));
}
function show(onMake = vi.fn(async () => undefined)) {
  render(<DesignBrews cards={{ [brewId]: [] }} generations={{ [brewId]: [generationId] }} onDraw={async () => undefined} onMake={onMake} stageHost={null} stagedBrew={null} onStage={() => undefined}>
    <BrewGenerationCard generation={{ brewId, jobPostingId: brewId, generationId }} />
  </DesignBrews>);
  return onMake;
}
beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); cancel.mockClear(); });

describe("생성 카드", () => {
  it("지면이 서기 전에는 지금의 생성 화면과 같은 기다림 그림을 보이고, 생성을 멈출 수 있다", async () => {
    serve(generation("running"));
    show();
    fireEvent.click(await screen.findByRole("button", { name: "생성 멈추기" }));
    await waitFor(() => expect(cancel).toHaveBeenCalledWith(generationId));
    // 기다림 그림이 고른 기록을 잔으로 내린다.
    expect(screen.getAllByText("결제 화면 성능 개선").length).toBeGreaterThan(0);
  });

  it("다 만들면 다듬기에서 연다", async () => {
    serve(generation("done", { portfolioId }));
    show();
    expect((await screen.findByRole("link", { name: "다듬기에서 열기" })).getAttribute("href")).toBe(`/edit/${portfolioId}`);
  });

  it("멈춘 생성은 크레딧을 쓰지 않았다고 알리고 다시 만들 수 있다", async () => {
    serve(generation("failed", { failureCode: "CANCELLED" }));
    const onMake = show();
    expect((await screen.findByRole("status")).textContent).toContain("크레딧은 차감하지 않았습니다");
    fireEvent.click(screen.getByRole("button", { name: "다시 만들기" }));
    await waitFor(() => expect(onMake).toHaveBeenCalledWith(brewId));
  });
});
