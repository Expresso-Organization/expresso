// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentBrewDesign, DesignChat } from "@expresso/contracts";
import type { BrewDesignCardData } from "@/lib/brew-design-card";
import { BrewDesignCard } from "./BrewDesignCard";
import { DesignBrews } from "./design-brews";

// 서버 액션은 이 테스트가 보는 것이 아니다. 무엇이 불렸는지만 본다.
const ensureRecipe = vi.fn(async (_brewId: string) => ({ error: null as string | null }));
vi.mock("@/app/(app)/brew/[brewId]/design/design-actions", () => ({ ensureRecipeAction: (brewId: string) => ensureRecipe(brewId), startGenerationAction: vi.fn() }));

const brewId = "00000000-0000-4000-8000-000000000001";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const tokens = { background: "#ffffff", text: "#111111", accent: "#ff0066", font: "sans" as const, density: "comfortable" as const };
const at = "2026-11-20T00:00:00.000Z";
const blocks = [{ kind: "title" as const, x: 0, y: 0, w: 8, h: 2 }];
const opening: DesignChat["messages"][number] = {
  id: id(10), role: "assistant", status: "complete", createdAt: at, text: "결제 화면을 빠르게 만든 일이 눈에 띄어요. 어떤 느낌으로 보여 드릴까요?",
  card: { kind: "proposals", styles: [{ id: id(20), name: "새벽 청록", words: "결제 화면의 색", tokens }], layouts: [{ id: id(30), name: "차트 주인공", words: "로딩 시간 차트", blocks }] },
};
/** 말로 다시 받은 견본. 스타일만 새로 냈다. */
const warmer: DesignChat["messages"][number] = { id: id(13), role: "assistant", status: "complete", createdAt: at, text: "", card: { kind: "proposals", styles: [{ id: id(21), name: "따뜻한 종이", words: "문서의 종이 색", tokens }], layouts: [] } };
const snippet = { id: id(40), origin: "agent" as const, name: "새벽 청록", note: "차트를 앞에 세웠어요.", words: "", tokens, layout: null, css: "body{}", html: "<main>박민재</main>", fromSnippetId: null, createdAt: at };
const drawn: DesignChat["messages"][number] = { id: id(11), role: "assistant", status: "complete", createdAt: at, text: "차트를 앞에 세웠어요.", card: { kind: "screens", items: [{ id: id(50), name: "새벽 청록", words: "", tokens, layout: null, status: "done", snippetId: id(40) }] } };
const user = (n: number): DesignChat["messages"][number] => ({ id: id(n), role: "user", action: "say", text: "", subjects: [], createdAt: at });
const chat = (extra: Partial<DesignChat> = {}): DesignChat => ({ id: id(1), brewId, messages: [opening], snippets: [], selectedSnippetId: null, run: null, version: 1, updatedAt: at, ...extra });
const context = (extra: Partial<BrewDesignCardData> = {}): BrewDesignCardData => ({ recipeId: id(2), recipeBuilding: false, recipeFailure: null, generationAllowed: true, generating: false, portfolioId: null, ...extra });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** 카드가 부르는 웹 경로의 대역. 열기 · 고르기 요청을 센다. */
function serve(card: BrewDesignCardData, current: DesignChat | null) {
  const calls: string[] = [];
  let state = current;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (url === `/api/brews/${brewId}/design-card`) return json({ data: card });
    if (url === `/api/brews/${brewId}/design-chat/open`) { calls.push("open"); state = chat(); return json({ data: state }); }
    if (url === `/api/brews/${brewId}/design-chat/selection`) { calls.push("select"); state = { ...state!, selectedSnippetId: JSON.parse(String(init!.body)).snippetId, version: state!.version + 1 }; return json({ data: state }); }
    if (url.startsWith(`/api/brews/${brewId}/design-chat`)) return json({ data: { chat: state, unchanged: false } });
    throw new Error(`예상하지 못한 요청 ${url}`);
  }));
  return calls;
}
/** 대화가 그리는 모양 그대로 — 제작의 디자인 상태 하나를 여러 카드가 읽는다. */
function show(cards: AgentBrewDesign[], onDraw = vi.fn(async () => undefined)) {
  const wanted = { [brewId]: cards.flatMap((card) => (card.designMessageId ? [card.designMessageId] : [])) };
  render(<DesignBrews cards={wanted} generations={{}} onDraw={onDraw} onMake={async () => undefined} stageHost={null} stagedBrew={null} onStage={() => undefined}>{cards.map((card) => <BrewDesignCard key={card.designMessageId ?? "open"} design={card} />)}</DesignBrews>);
  return onDraw;
}
const card = (designMessageId: string | null): AgentBrewDesign => ({ brewId, jobPostingId: brewId, designMessageId });
beforeEach(() => { vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} }); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); ensureRecipe.mockClear(); });

describe("디자인 카드", () => {
  it("구성이 없으면 기다리고 디자인 대화를 열지 않는다. 실패하면 사유와 다시 맡기기를 둔다", async () => {
    const calls = serve(context({ recipeId: null, recipeBuilding: true }), null);
    show([card(null)]);
    expect(await screen.findByText("구성을 만드는 중")).toBeTruthy();
    expect(calls).toEqual([]);
    cleanup();

    serve(context({ recipeId: null, recipeFailure: "고른 재료가 세 건보다 적어 구성을 만들지 못했습니다." }), null);
    show([card(null)]);
    expect((await screen.findByRole("alert")).textContent).toContain("세 건보다 적어");
    fireEvent.click(screen.getByRole("button", { name: "다시 맡기기" }));
    await waitFor(() => expect(ensureRecipe).toHaveBeenCalledWith(brewId));
  });

  it("구성이 있으면 디자인 대화를 열어 첫 말과 견본을 그리고, 고른 짝은 이 대화의 경로로 그린다. 카탈로그 화면으로 가는 길을 둔다", async () => {
    const calls = serve(context(), null);
    const onDraw = show([card(null)]);
    expect(await screen.findByText(opening.text)).toBeTruthy();
    expect(calls).toEqual(["open"]);
    expect(screen.getByRole("link", { name: "카탈로그 화면으로" }).getAttribute("href")).toBe(`/brew/${brewId}/design?view=catalog`);
    fireEvent.click(screen.getByRole("button", { name: "스타일 새벽 청록" }));
    fireEvent.click(screen.getByRole("button", { name: "레이아웃 차트 주인공" }));
    fireEvent.click(screen.getByRole("button", { name: "첫 화면 보기" }));
    await waitFor(() => expect(onDraw).toHaveBeenCalledWith(brewId, id(20), id(30)));
  });

  it("한 제작의 카드들은 상태 하나를 함께 읽는다 — 앞선 견본의 레이아웃을 새 견본의 스타일과 짝짓고, 고른 첫 화면은 한 곳에만 만들기를 둔다", async () => {
    serve(context(), chat({ messages: [opening, user(12), drawn, user(14), warmer], snippets: [snippet] }));
    const onDraw = show([card(null), card(id(11)), card(id(13))]);
    await screen.findByText(opening.text);
    const [first, , third] = screen.getAllByRole("region", { name: "디자인" }) as [HTMLElement, HTMLElement, HTMLElement];
    // 짝짓기와 「첫 화면 보기」는 가장 나중의 견본 카드에만 있다. 레이아웃은 앞선 카드에서 고른다.
    expect(within(first).queryByRole("button", { name: "첫 화면 보기" })).toBeNull();
    fireEvent.click(within(first).getByRole("button", { name: "레이아웃 차트 주인공" }));
    fireEvent.click(within(third).getByRole("button", { name: "스타일 따뜻한 종이" }));
    fireEvent.click(within(third).getByRole("button", { name: "첫 화면 보기" }));
    await waitFor(() => expect(onDraw).toHaveBeenCalledWith(brewId, id(21), id(30)));
    // 그린 첫 화면을 고르면 그 카드에만 만들기가 뜬다.
    fireEvent.click(screen.getByRole("button", { name: "이 스타일 고르기" }));
    await screen.findByRole("button", { name: "골랐습니다" });
    expect(screen.getAllByRole("button", { name: /이 스타일로 만들기/ })).toHaveLength(1);
  });

  it("이미 만든 포트폴리오는 다시 만들지 않고 연다", async () => {
    serve(context({ portfolioId: id(60) }), chat({ messages: [opening, user(12), drawn], snippets: [snippet], selectedSnippetId: id(40) }));
    show([card(id(11))]);
    expect((await screen.findByRole("link", { name: "만든 포트폴리오 열기" })).getAttribute("href")).toBe(`/edit/${id(60)}`);
    expect(screen.queryByRole("button", { name: /이 스타일로 만들기/ })).toBeNull();
  });
});
