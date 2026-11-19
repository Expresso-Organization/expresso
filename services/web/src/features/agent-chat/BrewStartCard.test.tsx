// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentBrewStart, AgentBrewStartState } from "@expresso/contracts";
import { BrewStartCard } from "./BrewStartCard";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const conversationId = "00000000-0000-4000-8000-000000000001";
const start: AgentBrewStart = { startId: "00000000-0000-4000-8000-000000000002", jobPostingId: "00000000-0000-4000-8000-000000000003", jobAnalysisId: "00000000-0000-4000-8000-000000000004", title: "프론트엔드 개발자", companyName: "가상 회사", brewId: null };
const running: AgentBrewStartState = { status: "running", stage: "covering", failure: null, requirements: null, brewId: null };
const done: AgentBrewStartState = { status: "done", stage: "done", failure: null, requirements: { total: 6, covered: 1, partial: 5, missing: 0 }, brewId: null };
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
afterEach(() => { cleanup(); vi.unstubAllGlobals(); push.mockReset(); });

describe("포트폴리오 제작 카드", () => {
  it("분석이 도는 동안 진행 막대와 지금 단계를 보이고, 제작을 여는 단추는 없다", async () => {
    serve({ "GET ": () => json({ data: running }) });
    render(<BrewStartCard conversationId={conversationId} start={start} disabled={false} />);
    expect(screen.getByText("가상 회사")).toBeTruthy();
    expect(screen.getByText("프론트엔드 개발자")).toBeTruthy();
    await waitFor(() => expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("88"));
    expect(screen.getByText("내 기록과 대조하는 중")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("분석이 끝나면 요건의 확인 수를 보이고, 「담을 기록 고르기」가 제작을 열어 그 화면으로 간다", async () => {
    const brewId = "00000000-0000-4000-8000-000000000005";
    const calls = serve({ "GET ": () => json({ data: done }), "POST /open": () => json({ data: { brewId, path: `/brew/${brewId}/materials` } }) });
    render(<BrewStartCard conversationId={conversationId} start={start} disabled={false} />);
    const bar = await screen.findByRole("img");
    expect(bar.getAttribute("aria-label")).toBe("요건 6개 가운데 기록 있음 1, 기록 일부 5, 기록 없음 0");
    fireEvent.click(screen.getByRole("button", { name: "담을 기록 고르기" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/brew/${brewId}/materials`));
    expect(calls).toContain("POST /open");
  });

  it("이미 만든 제작이 있으면 「이어서 만들기」이고, 실행 중에는 누를 수 없다", async () => {
    serve({ "GET ": () => json({ data: { ...done, brewId: "00000000-0000-4000-8000-000000000005" } }) });
    render(<BrewStartCard conversationId={conversationId} start={start} disabled />);
    expect(((await screen.findByRole("button", { name: "이어서 만들기" })) as HTMLButtonElement).disabled).toBe(true);
  });

  it("다시 해 볼 수 있는 실패에만 「다시 분석」을 두고, 누르면 다시 맡긴 상태로 바뀐다", async () => {
    const calls = serve({
      "GET ": () => json({ data: { status: "failed", stage: "failed", failure: { code: "AI_TIMEOUT", retryable: true }, requirements: null, brewId: null } }),
      "POST /retry": () => json({ data: { status: "queued", stage: "queued", failure: null, requirements: null, brewId: null } }),
    });
    render(<BrewStartCard conversationId={conversationId} start={start} disabled={false} />);
    fireEvent.click(await screen.findByRole("button", { name: "다시 분석" }));
    await waitFor(() => expect(calls).toContain("POST /retry"));
    await waitFor(() => expect(screen.queryByRole("button", { name: "다시 분석" })).toBeNull());
    cleanup();

    serve({ "GET ": () => json({ data: { status: "failed", stage: "failed", failure: { code: "EXTRACTOR_UNAVAILABLE", retryable: false }, requirements: null, brewId: null } }) });
    render(<BrewStartCard conversationId={conversationId} start={start} disabled={false} />);
    expect(await screen.findByText("이 공고는 분석하지 못했습니다.")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("제작을 열지 못하면 서버가 준 이유를 보인다", async () => {
    serve({ "GET ": () => json({ data: done }), "POST /open": () => json({ error: { message: "응답이 끝난 뒤 눌러 주세요." } }, 409) });
    render(<BrewStartCard conversationId={conversationId} start={start} disabled={false} />);
    fireEvent.click(await screen.findByRole("button", { name: "담을 기록 고르기" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("응답이 끝난 뒤 눌러 주세요."));
    expect(push).not.toHaveBeenCalled();
  });
});
