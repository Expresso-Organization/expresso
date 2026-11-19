// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BrewMaterialsCardData } from "@/lib/brew-materials-card";
import { BrewMaterialsCard } from "./BrewMaterialsCard";

// 서버 액션은 이 테스트가 보는 것이 아니다. 폼이 어느 액션에 묶였는지만 본다.
vi.mock("@/app/(app)/brew/[brewId]/brew-actions", () => ({ beginInterviewAction: vi.fn() }));

const brewId = "00000000-0000-4000-8000-000000000001";
const ids = ["00000000-0000-4000-8000-0000000000a1", "00000000-0000-4000-8000-0000000000a2", "00000000-0000-4000-8000-0000000000a3"] as const;
const row = (recordId: string, title: string, score: number, selected: boolean) => ({
  recordId, title, status: "organized" as const, score, rank: 0, selected, selectedBy: "auto" as const, excludedReason: selected ? null : "AUTO_LIMIT",
  categoryName: "프로젝트", categoryKey: "project", categoryIcon: "briefcase", periodFrom: null, periodTo: null, origin: "manual" as const, reason: "요건과 겹치는 낱말",
});
const data = (selected: boolean[], extra: Partial<BrewMaterialsCardData> = {}): BrewMaterialsCardData => ({
  materials: {
    brewId, jobAnalysisId: "00000000-0000-4000-8000-000000000002", updatedAt: "2026-11-20T00:00:00.000Z", selectionLimit: 2, mode: "solo", lengthPreset: "single", draftCount: 0,
    materials: [row(ids[0], "디자인 시스템 구축", 90, selected[0]!), row(ids[1], "주문 현황 대시보드", 60, selected[1]!), row(ids[2], "접근성 개선", 30, selected[2]!)],
  },
  beginsInterview: true, basisJobId: null, resumePath: null, ...extra,
});
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** 재료 API의 대역. 저장한 목록을 남기고, 저장한 대로 고른 목록을 돌려준다. */
function serve(first: BrewMaterialsCardData, save?: (recordIds: string[]) => Response) {
  const saved: string[][] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    expect(url).toBe(`/api/brews/${brewId}/materials`);
    if (init?.method !== "PUT") return json({ data: first });
    const { recordIds } = JSON.parse(String(init.body)) as { recordIds: string[] };
    saved.push(recordIds);
    return save ? save(recordIds) : json({ data: data(ids.map((id) => recordIds.includes(id))) });
  }));
  return saved;
}
const show = () => render(<BrewMaterialsCard materials={{ brewId, jobPostingId: "00000000-0000-4000-8000-000000000003" }} />);
const boxes = () => screen.getAllByRole("checkbox") as HTMLInputElement[];
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("재료 고르기 카드", () => {
  it("줄 세운 기록과 지금 고른 수를 보인다", async () => {
    serve(data([true, true, false]));
    show();
    expect(await screen.findByText("디자인 시스템 구축")).toBeTruthy();
    expect(boxes().map((box) => box.checked)).toEqual([true, true, false]);
    expect(screen.getByText("2").closest("span")!.textContent).toBe("고른 기록 2 / 2");
    // 매칭은 가장 잘 맞는 기록을 가득 찬 막대로 삼아 견준다.
    expect(screen.getAllByRole("img").map((bar) => bar.getAttribute("aria-label"))).toEqual(["매칭 90", "매칭 60", "매칭 30"]);
  });

  it("줄을 누르면 고른 목록 전체를 저장한다", async () => {
    const saved = serve(data([true, true, false]));
    show();
    await screen.findByText("디자인 시스템 구축");
    fireEvent.click(boxes()[1]!);
    await waitFor(() => expect(saved).toEqual([[ids[0]]]));
    await waitFor(() => expect(screen.getByText("1").closest("span")!.textContent).toBe("고른 기록 1 / 2"));
    fireEvent.click(boxes()[2]!);
    await waitFor(() => expect(saved.at(-1)).toEqual([ids[0], ids[2]]));
  });

  it("한도를 채운 뒤 더 고르면 저장하지 않고 알린다", async () => {
    const saved = serve(data([true, true, false]));
    show();
    await screen.findByText("디자인 시스템 구축");
    fireEvent.click(boxes()[2]!);
    expect((await screen.findByRole("alert")).textContent).toBe("한 번에 2건까지 담을 수 있습니다. 빼고 다시 골라 주세요.");
    expect(saved).toEqual([]);
    expect(boxes()[2]!.checked).toBe(false);
  });

  it("저장하지 못하면 누르기 전으로 되돌리고 이유를 보인다", async () => {
    serve(data([true, true, false]), () => json({ error: { message: "고를 수 없는 기록이 섞여 있습니다." } }, 409));
    show();
    await screen.findByText("디자인 시스템 구축");
    fireEvent.click(boxes()[0]!);
    expect((await screen.findByRole("alert")).textContent).toBe("고를 수 없는 기록이 섞여 있습니다.");
    expect(boxes().map((box) => box.checked)).toEqual([true, true, false]);
  });

  it("다음 단계는 질문 만들기를 맡기는 폼이고, 질문이 이미 있으면 대화 화면으로 가는 링크다. 넓게 보기는 지금의 재료 화면이다", async () => {
    serve(data([true, false, false]));
    show();
    const begin = await screen.findByRole("button", { name: "AI와 대화 시작" });
    expect(begin.closest("form")!.querySelector<HTMLInputElement>('input[name="brewId"]')!.value).toBe(brewId);
    expect(screen.getByRole("link", { name: "넓게 보기" }).getAttribute("href")).toBe(`/brew/${brewId}/materials`);
    cleanup();

    serve(data([false, false, false], { beginsInterview: false }));
    show();
    // 하나도 고르지 않았으면 단추의 말이 바뀐다.
    expect((await screen.findByRole("link", { name: "기록 없이 계속" })).getAttribute("href")).toBe(`/brew/${brewId}/counter`);
  });

  it("다음 단계로 넘어간 제작의 카드는 고른 것을 보이기만 하고, 그 단계로 가는 링크만 둔다", async () => {
    const saved = serve(data([true, true, false], { beginsInterview: false, resumePath: `/brew/${brewId}/design` }));
    show();
    await screen.findByText("디자인 시스템 구축");
    expect(boxes().every((box) => box.disabled)).toBe(true);
    fireEvent.click(boxes()[1]!);
    expect(saved).toEqual([]);
    expect(screen.getByRole("link", { name: "이어서 만들기" }).getAttribute("href")).toBe(`/brew/${brewId}/design`);
    expect(screen.queryByRole("link", { name: "넓게 보기" })).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
