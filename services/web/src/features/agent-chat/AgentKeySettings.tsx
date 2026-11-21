"use client";
import { useEffect, useState } from "react";
import { AgentChatAccessSchema } from "@expresso/contracts";
import { AgentApiKeyForm } from "./AgentApiKeyForm";
import { Button } from "@/components/ui/button";
import "@/styles/agent-chat-framework.css";
export function AgentKeySettings() {
  const [access, setAccess] = useState<ReturnType<typeof AgentChatAccessSchema.parse>["data"] | null>(null);
  const [error, setError] = useState(false); const [revision, setRevision] = useState(0);
  useEffect(() => { const abort = new AbortController(); setError(false); void fetch("/api/agent/access", { signal: abort.signal, cache: "no-store" }).then(async response => { if (!response.ok) throw new Error(); setAccess(AgentChatAccessSchema.parse(await response.json()).data); }).catch(() => { if (!abort.signal.aborted) setError(true); }); return () => abort.abort(); }, [revision]);
  return <div className="acf-scope">{error ? <div role="alert">설정을 불러오지 못했습니다.<Button variant="outline" onClick={() => setRevision(value => value + 1)}>다시 시도</Button></div> : !access ? <p role="status">설정 불러오는 중…</p> : <><p>모든 계정이 키 없이 채팅을 쓸 수 있고, 사용량은 이번 달 크레딧에서 차감됩니다. Anthropic API 키를 등록하면 그 키로 대화하며 크레딧 한도를 보지 않습니다.</p><p role="status">{access.apiKeyConfigured ? "Anthropic API 키 등록됨" : "등록된 Anthropic API 키가 없습니다."}</p><AgentApiKeyForm configured={access.apiKeyConfigured} onSaved={configured => setAccess(current => current ? { ...current, apiKeyConfigured: configured } : current)} /></>}</div>;
}
