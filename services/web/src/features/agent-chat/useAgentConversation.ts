"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { AgentConversationResponseSchema, AgentConversationListSchema, type AgentConversation, type AgentContext, type AgentApproval } from "@expresso/contracts";
const base = "/api/agent/conversations";
export async function agentRequest(path: string, body?: unknown) {
  const response = await fetch(`${base}${path}`, { ...(body === undefined ? {} : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), cache: "no-store" });
  const payload = await response.json();
  if (!response.ok && payload.error?.details?.requiredConsent === "career_records") throw new Error("AI 사용 동의가 필요합니다. 설정에서 커리어 기록 사용을 켜 주세요.");
  if (!response.ok) throw new Error(payload.error?.message ?? payload.message ?? "대화를 불러오지 못했습니다.");
  return AgentConversationResponseSchema.parse(payload).data;
}
export function useAgentConversation(context?: AgentContext) {
  const [id, setId] = useState<string | null>(null);
  const [conversation, setConversation] = useState<AgentConversation | null>(null);
  const [list, setList] = useState<ReturnType<typeof AgentConversationListSchema.parse>["data"]>([]);
  const [issue, setIssue] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const currentId = useRef(id); currentId.current = id;
  const requestId = useRef<{ text: string; id: string } | null>(null);
  const accept = useCallback((next: AgentConversation) => {
    if (!mounted.current || currentId.current !== next.id) return;
    setConversation(old => old?.id === next.id && old.version > next.version ? old : next);
  }, []);
  const select = useCallback((next: string | null) => {
    currentId.current = next; setId(next); setConversation(null); setIssue(null); requestId.current = null;
    const url = new URL(window.location.href); if (next) { url.searchParams.set("chat", next); sessionStorage.setItem("ex-agent-conversation", next); } else { url.searchParams.delete("chat"); sessionStorage.removeItem("ex-agent-conversation"); }
    window.history.replaceState(null, "", url);
  }, []);
  useEffect(() => { select(new URL(window.location.href).searchParams.get("chat") ?? sessionStorage.getItem("ex-agent-conversation")); }, [select]);
  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      try {
        const response = await fetch(base, { cache: "no-store" }); if (!response.ok) throw new Error("대화 목록을 불러오지 못했습니다.");
        const rows = AgentConversationListSchema.parse(await response.json()).data; if (alive) setList(rows);
      } catch (error) { if (alive) setIssue(error instanceof Error ? error.message : "연결 오류"); }
    };
    void refresh(); const timer = setInterval(() => void refresh(), 10_000); return () => { alive = false; clearInterval(timer); };
  }, [id]);
  useEffect(() => {
    if (!id) return;
    let alive = true;
    const refresh = () => agentRequest(`/${id}`).then(next => { if (alive) accept(next); }).catch(error => { if (alive) setIssue(error.message); });
    void refresh(); const timer = setInterval(() => void refresh(), 3_000);
    return () => { alive = false; clearInterval(timer); };
  }, [id, accept]);
  useEffect(() => {
    if (!id || conversation?.run?.status !== "running") return;
    const events = new EventSource(`${base}/${id}/events`);
    events.addEventListener("snapshot", event => { try { accept(AgentConversationResponseSchema.parse(JSON.parse((event as MessageEvent).data)).data); } catch { setIssue("응답 스트림을 읽지 못했습니다."); events.close(); } });
    return () => events.close();
  }, [id, conversation?.run?.status, accept]);
  const perform = async (action: () => Promise<AgentConversation>) => {
    setPending(true); setIssue(null);
    try { accept(await action()); } catch (error) { setIssue(error instanceof Error ? error.message : "요청에 실패했습니다."); } finally { setPending(false); }
  };
  const send = async (text: string, apiKey?: string) => {
    if (pending) return;
    setPending(true); setIssue(null);
    try {
      let target = id;
      if (!target) { const created = await agentRequest("", { contexts: context ? [context] : [] }); if (!mounted.current) return; select(created.id); accept(created); target = created.id; }
      requestId.current = requestId.current?.text === text ? requestId.current : { text, id: crypto.randomUUID() };
      accept(await agentRequest(`/${target}/messages`, { text, requestId: requestId.current.id, ...(apiKey ? { apiKey } : {}) })); requestId.current = null;
    } catch (error) { setIssue(error instanceof Error ? error.message : "보내지 못했습니다."); throw error; } finally { setPending(false); }
  };
  return { id, conversation, list, issue, pending, select, send,
    attach: () => id && context ? perform(() => agentRequest(`/${id}/contexts`, { context })) : Promise.resolve(),
    cancel: () => perform(() => agentRequest(`/${id}/cancel`, {})),
    approve: (input: AgentApproval) => perform(() => agentRequest(`/${id}/approval`, input)),
  };
}
