// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DesignChat } from "@expresso/contracts";
import type { BrewDesignCardData } from "@/lib/brew-design-card";
import { BrewDesignCard } from "./BrewDesignCard";

// 서버 액션은 이 테스트가 보는 것이 아니다. 무엇이 불렸는지만 본다.
const ensureRecipe = vi.fn(async (_brewId: string) => ({ error: null as string | null }));
vi.mock("@/app/(app)/brew/[brewId]/design/design-actions", () => ({ ensureRecipeAction: (brewId: string) => ensureRecipe(brewId), startGenerationAction: vi.fn() }));

const brewId = "00000000-0000-4000-8000-000000000001";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const tokens = { background: "#ffffff", text: "#111111", accent: "#ff0066", font: "sans" as const, density: "comfortable" as const };
const at = "2026-11-20T00:00:00.000Z";
const opening: DesignChat["messages"][number] = {
  id: id(10), role: "assistant", status: "complete", createdAt: at, text: "결제 화면을 빠르게 만든 일이 눈에 띄어요. 어떤 느낌으로 보여 드릴까요?",
  card: { kind: "proposals", styles: [{ id: id(20), name: "새벽 청록", words: "결제 화면의 색", tokens }], layouts: [{ id: id(30), name: "차트 주인공", words: "로딩 시간 차트", blocks: [{ kind: "title", x: 0, y: 0, w: 8, h: 2 }] }] },
};
const snippet = { id: id(40), origin: "agent" as const, name: "새벽 청록", note: "차트를 앞에 세웠어요.", words: "", tokens, layout: null, css: "body{}", html: "<main>박민재</main>", fromSnippetId: null, createdAt: at };
const drawn: DesignChat["messages"][number] = { id: id(11), role: "assistant", status: "complete", createdAt: at, text: "차트를 앞에 세웠어요.", card: { kind: "screens", items: [{ id: id(50), name: "새벽 청록", words: "", tokens, layout: null, status: "done", snippetId: id(40) }] } };
const chat = (extra: Partial<DesignChat> = {}): DesignChat => ({ id: id(1), brewId, messages: [opening], snippets: [], selectedSnippetId: null, run: null, version: 1, updatedAt: at, ...extra });
const context = (extra: Partial<BrewDesignCardData> = {}): BrewDesignCardData => ({ recipeId: id(2), recipeBuilding: false, recipeFailure: null, generationAllowed: true, generating: false, ...extra });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** 카드가 부르는 웹 경로의 대역. 열기 요청을 센다. */
function serve(card: BrewDesignCardData, current: DesignChat | null) {
  const opens: unknown[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (url === `/api/brews/${brewId}/design-card`) return json({ data: card });
    if (url === `/api/brews/${brewId}/design-chat/open`) { opens.push(init?.body); return json({ data: chat() }); }
    if (url.startsWith(`/api/brews/${brewId}/design-chat`)) return json({ data: { chat: current, unchanged: false } });
    throw new Error(`예상하지 못한 요청 ${url}`);
  }));
  return opens;
}
beforeEach(() => { vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} }); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); ensureRecipe.mockClear(); });

describe("디자인 카드", () => {
  it("구성이 없으면 기다리고 디자인 대화를 열지 않는다. 실패하면 사유와 다시 맡기기를 둔다", async () => {
    const opens = serve(context({ recipeId: null, recipeBuilding: true }), null);
    render(<BrewDesignCard design={{ brewId, jobPostingId: brewId, designMessageId: null }} onDraw={async () => undefined} />);
    expect(await screen.findByText("구성을 만드는 중")).toBeTruthy();
    expect(opens).toEqual([]);
    cleanup();

    serve(context({ recipeId: null, recipeFailure: "고른 재료가 세 건보다 적어 구성을 만들지 못했습니다." }), null);
    render(<BrewDesignCard design={{ brewId, jobPostingId: brewId, designMessageId: null }} onDraw={async () => undefined} />);
    expect((await screen.findByRole("alert")).textContent).toContain("세 건보다 적어");
    fireEvent.click(screen.getByRole("button", { name: "다시 맡기기" }));
    await waitFor(() => expect(ensureRecipe).toHaveBeenCalledWith(brewId));
  });

  it("구성이 있으면 디자인 대화를 열어 첫 말과 견본을 그리고, 고른 짝은 이 대화의 경로로 그린다", async () => {
    const opens = serve(context(), null);
    const onDraw = vi.fn(async () => undefined);
    render(<BrewDesignCard design={{ brewId, jobPostingId: brewId, designMessageId: null }} onDraw={onDraw} />);
    expect(await screen.findByText(opening.text)).toBeTruthy();
    expect(opens).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "스타일 새벽 청록" }));
    fireEvent.click(screen.getByRole("button", { name: "레이아웃 차트 주인공" }));
    fireEvent.click(screen.getByRole("button", { name: "첫 화면 보기" }));
    await waitFor(() => expect(onDraw).toHaveBeenCalledWith(id(20), id(30)));
  });

  it("그린 첫 화면의 카드는 그 답을 그리고, 고른 첫 화면이면 만들기를 둔다", async () => {
    serve(context(), chat({ messages: [opening, { id: id(12), role: "user", action: "draw", text: "", subjects: [], createdAt: at }, drawn], snippets: [snippet], selectedSnippetId: id(40) }));
    render(<BrewDesignCard design={{ brewId, jobPostingId: brewId, designMessageId: id(11) }} onDraw={async () => undefined} />);
    expect(await screen.findByText("차트를 앞에 세웠어요.")).toBeTruthy();
    // 견본은 여는 카드의 것이다. 이 카드에는 그린 첫 화면만 있다.
    expect(screen.queryByRole("button", { name: "첫 화면 보기" })).toBeNull();
    expect(screen.getByRole("button", { name: "골랐습니다" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /이 스타일로 만들기/ })).toBeTruthy();
  });
});
