// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentConversation } from "@expresso/contracts";
import { useAgentConversation } from "./useAgentConversation";
const first = "00000000-0000-4000-8000-000000000001";
const second = "00000000-0000-4000-8000-000000000002";
const at = "2026-09-14T00:00:00.000Z";
const row = (id = first, version = 1): AgentConversation => ({ id, title: "대화", contexts: [], messages: [], run: null, version, updatedAt: at });
class Events {
  static instances: Events[] = [];
  callback?: (event: { data: string }) => void;
  constructor() { Events.instances.push(this); }
  addEventListener(_type: string, callback: (event: { data: string }) => void) { this.callback = callback; }
  close() {}
}
beforeEach(() => { sessionStorage.clear(); window.history.replaceState(null, "", "/agent"); Events.instances = []; vi.stubGlobal("EventSource", Events); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe("공유 대화 상태", () => {
  it("새로고침 시 URL의 대화를 복원하고 늦게 도착한 이전 버전을 무시한다", async () => {
    window.history.replaceState(null, "", `/agent?chat=${first}`);
    const conversation = { ...row(), run: { id: second, requestId: second, status: "running" as const, error: null, startedAt: at } };
    vi.stubGlobal("fetch", vi.fn(async (url: string) => Response.json({ data: url.endsWith("conversations") ? [] : conversation })));
    const { result } = renderHook(() => useAgentConversation());
    await waitFor(() => expect(result.current.conversation?.id).toBe(first));
    await waitFor(() => expect(Events.instances.length).toBeGreaterThan(0));
    act(() => Events.instances.at(-1)!.callback!({ data: JSON.stringify({ data: { ...conversation, version: 3, title: "최신" } }) }));
    act(() => Events.instances.at(-1)!.callback!({ data: JSON.stringify({ data: { ...conversation, version: 2, title: "이전" } }) }));
    expect(result.current.conversation?.title).toBe("최신");
  });
  it("대화 전환 이후 도착한 이전 대화의 응답이 화면을 덮지 않는다", async () => {
    window.history.replaceState(null, "", `/agent?chat=${first}`);
    let release!: (value: Response) => void;
    vi.stubGlobal("fetch", vi.fn((url: string) => url.endsWith(first) ? new Promise<Response>(resolve => { release = resolve; }) : Promise.resolve(Response.json({ data: url.endsWith("conversations") ? [] : row(second) }))));
    const { result } = renderHook(() => useAgentConversation());
    await waitFor(() => expect(release).toBeDefined());
    act(() => result.current.select(second));
    await waitFor(() => expect(result.current.conversation?.id).toBe(second));
    await act(async () => release(Response.json({ data: row(first, 99) })));
    expect(result.current.conversation?.id).toBe(second);
  });
  it("공고 화면은 브라우저의 마지막 대화 대신 그 공고가 연결된 가장 최근 대화를 연다", async () => {
    const job = { kind: "job" as const, id: "00000000-0000-4000-8000-0000000000aa" };
    window.history.replaceState(null, "", "/jobs/aa");
    sessionStorage.setItem("ex-agent-conversation", second);
    const list = [{ ...row(second), contexts: [{ kind: "job" as const, id: "00000000-0000-4000-8000-0000000000bb" }] }, { ...row(first), contexts: [job] }].map(({ messages: _messages, ...summary }) => summary);
    vi.stubGlobal("fetch", vi.fn(async (url: string) => Response.json({ data: url.endsWith("conversations") ? list : row(first) })));
    const { result } = renderHook(() => useAgentConversation(job, { restore: "context" }));
    expect(result.current.resolving).toBe(true);
    await waitFor(() => expect(result.current.conversation?.id).toBe(first));
    expect(result.current.resolving).toBe(false);
    expect(new URL(window.location.href).searchParams.get("chat")).toBe(first);
  });
  it("공고가 연결된 대화가 없으면 새 대화로 시작하고 브라우저의 마지막 대화 기록은 남긴다", async () => {
    const job = { kind: "job" as const, id: "00000000-0000-4000-8000-0000000000aa" };
    window.history.replaceState(null, "", "/jobs/aa");
    sessionStorage.setItem("ex-agent-conversation", second);
    const fetcher = vi.fn(async (_url: string) => Response.json({ data: [] }));
    vi.stubGlobal("fetch", fetcher);
    const { result } = renderHook(() => useAgentConversation(job, { restore: "context" }));
    await waitFor(() => expect(result.current.resolving).toBe(false));
    expect(result.current.id).toBeNull();
    expect(sessionStorage.getItem("ex-agent-conversation")).toBe(second);
    expect(fetcher.mock.calls.every(([url]) => String(url).endsWith("conversations"))).toBe(true);
  });
  it("전송 실패 후 재시도에는 같은 요청 ID를 사용한다", async () => {
    window.history.replaceState(null, "", `/agent?chat=${first}`);
    const ids: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, options?: RequestInit) => {
      if (url.endsWith("messages")) { ids.push(JSON.parse(String(options?.body)).requestId); return Response.json({ error: { message: "잠시 후 재시도" } }, { status: 503 }); }
      return Response.json({ data: url.endsWith("conversations") ? [] : row() });
    }));
    const { result } = renderHook(() => useAgentConversation());
    await waitFor(() => expect(result.current.conversation?.id).toBe(first));
    await act(async () => { await result.current.send("다시 보내기").catch(() => undefined); });
    await act(async () => { await result.current.send("다시 보내기").catch(() => undefined); });
    expect(ids).toHaveLength(2); expect(ids[0]).toBe(ids[1]); expect(result.current.issue).toBe("잠시 후 재시도");
  });
});
