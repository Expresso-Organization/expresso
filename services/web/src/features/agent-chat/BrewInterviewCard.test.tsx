// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BrewState, InterviewQuestionBase, InterviewSession } from "@expresso/contracts";
import { interviewCard, type BrewInterviewCardData } from "@/lib/brew-interview-card";
import { BrewInterviewCard } from "./BrewInterviewCard";

// 서버 액션은 이 테스트가 보는 것이 아니다. 폼이 어느 액션에 묶였는지만 본다.
vi.mock("@/app/(app)/brew/[brewId]/brew-actions", () => ({ continueToDesignAction: vi.fn() }));

const brewId = "00000000-0000-4000-8000-000000000001";
const requirementId = "00000000-0000-4000-8000-0000000000b1";
const recordId = "00000000-0000-4000-8000-0000000000b2";
const bases: InterviewQuestionBase[] = [
  { basis: { type: "requirement", requirementId, coverage: "missing", evidence: "장애 대응 경험이 필요합니다." }, label: "장애 대응 경험" },
  { basis: { type: "record_gap", recordId, gap: "metric", evidence: "주문 현황 대시보드" }, label: "주문 현황 대시보드" },
];
const question = (answered: boolean, evidence: string) => ({
  id: "00000000-0000-4000-8000-0000000000c1", order: 0, text: "장애를 어떻게 대응하셨나요?", rationale: null, replacedFromId: null, skipped: false, answered,
  // 근거 글이 달라도(공고를 고친 뒤) 같은 요건이면 같은 근거다.
  basis: { type: "requirement" as const, requirementId, coverage: "missing" as const, evidence },
});
const session = (answered: boolean): InterviewSession => ({ id: "00000000-0000-4000-8000-0000000000d1", brewId, status: "open", currentOrder: 0, answeredCount: answered ? 1 : 0, questionCount: 1, questionsMayAdapt: true, questions: [question(answered, "고친 요건 글")] });
const brew = (status: BrewState["status"]) => ({ brewId, status }) as BrewState;
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
function serve(data: BrewInterviewCardData) {
  const fetch = vi.fn(async (url: string) => { expect(url).toBe(`/api/brews/${brewId}/interview`); return json({ data }); });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("AI 대화 카드의 데이터", () => {
  it("답한 질문을 근거 키로 맞추고, 디자인 단계로 간 제작은 그 화면으로 잇는다", () => {
    expect(interviewCard(brew("interviewing"), bases, session(true))).toEqual({
      bases: [{ kind: "requirement", label: "장애 대응 경험", answered: true }, { kind: "record", label: "주문 현황 대시보드", answered: false }],
      answered: 1, limit: 6, resumePath: null,
    });
    expect(interviewCard(brew("interviewing"), bases, session(false)).bases.map(base => base.answered)).toEqual([false, false]);
    expect(interviewCard(brew("interviewing"), bases, null)).toMatchObject({ answered: 0, resumePath: null });
    for (const status of ["recipe", "generating", "done"] as const) expect(interviewCard(brew(status), bases, null).resumePath).toBe(`/brew/${brewId}/design`);
  });
});

describe("AI 대화 카드", () => {
  it("근거와 답한 표시, 디자인 고르기를 보인다", async () => {
    serve(interviewCard(brew("interviewing"), bases, session(true)));
    render(<BrewInterviewCard interview={{ brewId, jobPostingId: brewId }} />);
    expect(await screen.findByText("장애 대응 경험")).toBeTruthy();
    expect(screen.getByText("1").closest("span")!.textContent).toBe("답한 질문 1 / 6");
    const rows = screen.getAllByRole("listitem").map(item => item.firstElementChild!.getAttribute("data-selected"));
    expect(rows).toEqual(["true", "false"]);
    const button = screen.getByRole("button", { name: "디자인 고르기" });
    expect(button.closest("form")!.querySelector<HTMLInputElement>('input[name="brewId"]')!.value).toBe(brewId);
  });

  it("대화의 판이 바뀌면 다시 읽는다", async () => {
    const fetch = serve(interviewCard(brew("interviewing"), bases, null));
    const { rerender } = render(<BrewInterviewCard interview={{ brewId, jobPostingId: brewId }} refreshKey={1} />);
    await screen.findByText("장애 대응 경험");
    rerender(<BrewInterviewCard interview={{ brewId, jobPostingId: brewId }} refreshKey={2} />);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  });

  it("디자인 단계로 넘어간 제작의 카드는 그 화면으로 가는 링크만 둔다", async () => {
    serve(interviewCard(brew("recipe"), bases, session(true)));
    render(<BrewInterviewCard interview={{ brewId, jobPostingId: brewId }} />);
    expect((await screen.findByRole("link", { name: "이어서 만들기" })).getAttribute("href")).toBe(`/brew/${brewId}/design`);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
