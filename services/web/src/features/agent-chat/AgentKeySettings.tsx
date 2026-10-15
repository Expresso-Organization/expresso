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
  return <div className="acf-scope">{error ? <div role="alert">설정을 불러오지 못했습니다.<Button variant="outline" onClick={() => setRevision(value => value + 1)}>다시 시도</Button></div> : !access ? <p role="status">설정 불러오는 중…</p> : access.serverCredentialAllowed ? <p>개발 멤버 계정은 서버 Claude 인증으로 Sonnet을 사용합니다. 개인 API 키는 필요하지 않습니다.</p> : <><p role="status">{access.apiKeyConfigured ? "Anthropic API 키 등록됨" : "등록된 Anthropic API 키가 없습니다."}</p><AgentApiKeyForm configured={access.apiKeyConfigured} onSaved={configured => setAccess(current => current ? { ...current, apiKeyConfigured: configured } : current)} /></>}</div>;
}
