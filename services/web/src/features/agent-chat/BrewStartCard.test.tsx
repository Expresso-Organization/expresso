// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentBrewStart, AgentBrewStartState } from "@expresso/contracts";
import { BrewStartCard } from "./BrewStartCard";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const conversationId = "00000000-0000-4000-8000-000000000001";
const brewId = "00000000-0000-4000-8000-000000000005";
const start: AgentBrewStart = { startId: "00000000-0000-4000-8000-000000000002", jobPostingId: "00000000-0000-4000-8000-000000000003", jobAnalysisId: "00000000-0000-4000-8000-000000000004", title: "프론트엔드 개발자", companyName: "가상 회사", brewId: null };
const running: AgentBrewStartState = { status: "running", stage: "covering", failure: null, requirements: null, brewId: null, step: null, announced: false };
const done: AgentBrewStartState = { status: "done", stage: "done", failure: null, requirements: { total: 6, covered: 1, partial: 5, missing: 0 }, brewId: null, step: null, announced: true };
const failed = (retryable: boolean): AgentBrewStartState => ({ status: "failed", stage: "failed", failure: { code: retryable ? "AI_TIMEOUT" : "EXTRACTOR_UNAVAILABLE", retryable }, requirements: null, brewId: null, step: null, announced: false });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** 요청 경로마다 정해 둔 답을 돌려주는 fetch. 부른 경로와 방식을 남긴다. */
function serve(answers: Record<string, () => Response>) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${url.replace(`/api/agent/conversations/${conversationId}/brew-starts/${start.startId}`, "")}`;
    calls.push(key);
    return (answers[key] ?? (() => json({ error: { message: "없는 경로" } }, 404)))();
  }));
  return calls;
}
const show = (props: Partial<Parameters<typeof BrewStartCard>[0]> = {}) => render(<BrewStartCard conversationId={conversationId} start={start} disabled={false} onOpen={vi.fn(async () => null)} {...props} />);
afterEach(() => { cleanup(); vi.unstubAllGlobals(); push.mockReset(); });

describe("포트폴리오 제작 카드", () => {
  it("분석이 도는 동안 진행 막대와 지금 단계를 보이고, 제작을 여는 단추는 없다", async () => {
    serve({ "GET ": () => json({ data: running }) });
    show();
    expect(screen.getByText("가상 회사")).toBeTruthy();
    expect(screen.getByText("프론트엔드 개발자")).toBeTruthy();
    await waitFor(() => expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("88"));
    expect(screen.getByText("내 기록과 대조하는 중")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("분석이 끝나면 요건의 확인 수를 보이고, 「담을 기록 고르기」는 화면을 넘기지 않고 대화에 카드를 붙인다", async () => {
    let state = done;
    serve({ "GET ": () => json({ data: state }) });
    const onOpen = vi.fn(async () => { state = { ...done, brewId, step: "materials" }; return null; });
    show({ onOpen });
    expect((await screen.findByRole("img")).getAttribute("aria-label")).toBe("요건 6개 가운데 기록 있음 1, 기록 일부 5, 기록 없음 0");
    fireEvent.click(screen.getByRole("button", { name: "담을 기록 고르기" }));
    await waitFor(() => expect(onOpen).toHaveBeenCalledTimes(1));
    expect(push).not.toHaveBeenCalled();
    // 재료 단계에서는 단추의 말이 그대로다 — 누르면 대화의 「재료 고르기」 카드로 간다.
    expect(await screen.findByRole("button", { name: "담을 기록 고르기" })).toBeTruthy();
  });

  it("재료 단계를 지난 제작은 「이어서 만들기」이고, 누르면 그 단계의 화면으로 간다. 답이 도는 동안에는 누를 수 없다", async () => {
    serve({ "GET ": () => json({ data: { ...done, brewId, step: "interview" } }) });
    const view = show({ disabled: true });
    expect(((await screen.findByRole("button", { name: "이어서 만들기" })) as HTMLButtonElement).disabled).toBe(true);
    view.rerender(<BrewStartCard conversationId={conversationId} start={start} disabled={false} onOpen={async () => `/brew/${brewId}/counter`} />);
    fireEvent.click(screen.getByRole("button", { name: "이어서 만들기" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/brew/${brewId}/counter`));
  });

  it("다시 해 볼 수 있는 실패에만 「다시 분석」을 두고, 누르면 다시 맡긴 상태로 바뀐다", async () => {
    // 다시 맡긴 뒤에는 카드가 곧바로 상태를 다시 읽는다. 그때의 답도 다시 맡긴 상태여야 한다.
    const queued = { ...running, status: "queued", stage: "queued" };
    const calls: string[] = serve({ "GET ": () => json({ data: calls.includes("POST /retry") ? queued : failed(true) }), "POST /retry": () => json({ data: queued }) });
    show();
    fireEvent.click(await screen.findByRole("button", { name: "다시 분석" }));
    await waitFor(() => expect(calls).toContain("POST /retry"));
    await waitFor(() => expect(screen.queryByRole("button", { name: "다시 분석" })).toBeNull());
    cleanup();

    serve({ "GET ": () => json({ data: failed(false) }) });
    show();
    expect(await screen.findByText("이 공고는 분석하지 못했습니다.")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("분석이 끝났고 아직 알리지 않았으면 알림을 한 번 청한다. 답이 도는 동안에는 기다리고, 이미 알린 분석과 도는 중인 분석에는 청하지 않는다", async () => {
    const onAnnounce = vi.fn(async () => {});
    serve({ "GET ": () => json({ data: { ...done, announced: false } }) });
    const view = show({ disabled: true, onAnnounce });
    await screen.findByRole("img");
    expect(onAnnounce).not.toHaveBeenCalled();
    const again = (disabled: boolean) => view.rerender(<BrewStartCard conversationId={conversationId} start={start} disabled={disabled} onOpen={async () => null} onAnnounce={onAnnounce} />);
    again(false);
    await waitFor(() => expect(onAnnounce).toHaveBeenCalledTimes(1));
    // 답이 다시 돌았다 끝나도 다시 청하지 않는다.
    again(true); again(false);
    expect(onAnnounce).toHaveBeenCalledTimes(1);
    cleanup();

    for (const state of [done, running]) {
      const quiet = vi.fn(async () => {});
      serve({ "GET ": () => json({ data: state }) });
      show({ onAnnounce: quiet });
      await screen.findByText(state.status === "done" ? "기록 일부" : "내 기록과 대조하는 중");
      expect(quiet).not.toHaveBeenCalled();
      cleanup();
    }
  });

  it("알리지 못해도 카드는 결과를 그대로 보인다", async () => {
    serve({ "GET ": () => json({ data: { ...done, announced: false } }) });
    show({ onAnnounce: vi.fn(async () => { throw new Error("이번 달 AI 크레딧을 모두 썼습니다."); }) });
    expect(await screen.findByRole("button", { name: "담을 기록 고르기" })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("제작을 열지 못하면 서버가 준 이유를 보인다", async () => {
    serve({ "GET ": () => json({ data: done }) });
    show({ onOpen: vi.fn(async () => { throw new Error("응답이 끝난 뒤 눌러 주세요."); }) });
    fireEvent.click(await screen.findByRole("button", { name: "담을 기록 고르기" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("응답이 끝난 뒤 눌러 주세요."));
    expect(push).not.toHaveBeenCalled();
  });
});
