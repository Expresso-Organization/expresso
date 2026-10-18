"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { AgentConversationResponseSchema, AgentConversationListSchema, type AgentConversation, type AgentContext, type AgentApproval, type AgentPlanDecision, type AgentRecordDraftDecision, type AgentReplanDecision } from "@expresso/contracts";
const base = "/api/agent/conversations";
export async function agentRequest(path: string, body?: unknown) {
  const response = await fetch(`${base}${path}`, { ...(body === undefined ? {} : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), cache: "no-store" });
  const payload = await response.json();
  if (!response.ok && payload.error?.details?.requiredConsent === "career_records") throw new Error("AI 사용 동의가 필요합니다. 설정에서 커리어 기록 사용을 켜 주세요.");
  if (!response.ok) throw new Error(payload.error?.message ?? payload.message ?? "대화를 불러오지 못했습니다.");
  return AgentConversationResponseSchema.parse(payload).data;
}
/**
 * `restore: "context"`는 처음 열 대화를 브라우저의 마지막 대화가 아니라 `context`가
 * 연결된 가장 최근 대화로 고른다. 공고 화면이 쓴다 — 다른 공고의 대화가 열리지 않게.
 */
export function useAgentConversation(context?: AgentContext, options: { restore?: "context" } = {}) {
  const { restore } = options;
  const [id, setId] = useState<string | null>(null);
  const [resolving, setResolving] = useState(restore === "context" && !!context);
  const [conversation, setConversation] = useState<AgentConversation | null>(null);
  const [list, setList] = useState<ReturnType<typeof AgentConversationListSchema.parse>["data"]>([]);
  const [issue, setIssue] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const contextMutation = useRef(false);
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
  const contextKind = context?.kind; const contextId = context?.id;
  useEffect(() => {
    const requested = new URL(window.location.href).searchParams.get("chat");
    if (requested || restore !== "context" || !contextKind || !contextId) { setResolving(false); select(requested ?? sessionStorage.getItem("ex-agent-conversation")); return; }
    let alive = true;
    setResolving(true);
    // 목록은 updatedAt 내림차순이다. 맞는 대화가 없으면 아무것도 고르지 않는다 —
    // select(null)은 브라우저에 남은 마지막 대화 기록까지 지운다.
    void fetch(base, { cache: "no-store" })
      .then(async response => { if (!response.ok) throw new Error("list"); return AgentConversationListSchema.parse(await response.json()).data; })
      .then(rows => { if (!alive) return; setList(rows); const found = rows.find(row => row.contexts.some(ref => ref.kind === contextKind && ref.id === contextId)); if (found) select(found.id); })
      .catch(() => undefined)
      .finally(() => { if (alive) setResolving(false); });
    return () => { alive = false; };
  }, [select, restore, contextKind, contextId]);
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
  const send = async (text: string) => {
    if (pending || contextMutation.current) return;
    setPending(true); setIssue(null);
    try {
      let target = id;
      if (!target) { const created = await agentRequest("", { contexts: context ? [context] : [] }); if (!mounted.current) return; select(created.id); accept(created); target = created.id; }
      requestId.current = requestId.current?.text === text ? requestId.current : { text, id: crypto.randomUUID() };
      accept(await agentRequest(`/${target}/messages`, { text, requestId: requestId.current.id })); requestId.current = null;
    } catch (error) { setIssue(error instanceof Error ? error.message : "보내지 못했습니다."); throw error; } finally { setPending(false); }
  };
  const toggleContext = async (ref: AgentContext) => {
    if (contextMutation.current || pending || conversation?.run?.status === "running" || (id && !conversation)) return;
    contextMutation.current = true; setPending(true); setIssue(null);
    try {
      if (!id) {
        const contexts = context && (context.kind !== ref.kind || context.id !== ref.id) ? [context, ref] : [ref];
        const created = await agentRequest("", { contexts });
        if (!mounted.current) return;
        select(created.id); accept(created);
      } else {
        const current = conversation!.contexts;
        const selected = current.some(item => item.kind === ref.kind && item.id === ref.id);
        if (!selected && current.length >= 10) throw new Error("한 대화에 자료를 최대 10개까지 연결할 수 있습니다.");
        const contexts = selected ? current.filter(item => item.kind !== ref.kind || item.id !== ref.id) : [...current, ref];
        accept(await agentRequest(`/${id}/context-selection`, { contexts, expectedVersion: conversation!.version }));
      }
    } catch (error) { setIssue(error instanceof Error ? error.message : "자료 선택을 저장하지 못했습니다."); }
    finally { contextMutation.current = false; setPending(false); }
  };
  const decide = async (path: string, decision: unknown) => {
    setPending(true); setIssue(null);
    try { accept(await agentRequest(`/${id}/${path}`, decision)); } finally { setPending(false); }
  };
  return { id, conversation, list, issue, pending, resolving, select, send, toggleContext,
    attach: () => id && context ? perform(() => agentRequest(`/${id}/contexts`, { context })) : Promise.resolve(),
    cancel: () => perform(() => agentRequest(`/${id}/cancel`, {})),
    retry: () => perform(() => agentRequest(`/${id}/retry`, {})),
    /** 초안 승인 · 거절. 실패를 카드가 직접 보여 주도록 오류를 다시 던진다. */
    decideDraft: (draftId: string, decision: AgentRecordDraftDecision) => decide(`record-drafts/${draftId}`, decision),
    decidePlanDraft: (draftId: string, decision: AgentPlanDecision) => decide(`plan-drafts/${draftId}`, decision),
    decideReplanDraft: (draftId: string, decision: AgentReplanDecision) => decide(`replan-drafts/${draftId}`, decision),
    approve: (input: AgentApproval) => perform(() => agentRequest(`/${id}/approval`, input)),
  };
}
