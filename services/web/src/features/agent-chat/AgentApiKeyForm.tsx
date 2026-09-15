"use client";
import { useState } from "react";
import { AgentApiKeySchema, AgentCredentialStatusSchema } from "@expresso/contracts";
import { Button } from "@/components/ui/button";
import styles from "./AgentChat.module.css";
export function AgentApiKeyForm({ configured, onSaved }: { configured: boolean; onSaved(configured: boolean): void }) {
  const [key, setKey] = useState("");
  const [pending, setPending] = useState(false);
  const [issue, setIssue] = useState<string | null>(null);
  async function save(remove = false) {
    if (pending) return;
    setPending(true); setIssue(null);
    try {
      const response = await fetch("/api/agent/credential", { method: remove ? "DELETE" : "PUT", ...(remove ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify({ apiKey: key.trim() }) }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "API 키를 저장하지 못했습니다.");
      const result = AgentCredentialStatusSchema.parse(payload); setKey(""); onSaved(result.data.configured);
    } catch (error) { setIssue(error instanceof Error ? error.message : "요청에 실패했습니다."); }
    finally { setPending(false); }
  }
  return <form className={styles.keyForm} onSubmit={event => { event.preventDefault(); void save(); }}>
    <label>Anthropic API 키<input aria-label="Anthropic API 키" type="password" autoComplete="new-password" spellCheck={false} maxLength={300} value={key} disabled={pending} onChange={event => setKey(event.target.value)} placeholder={configured ? "교체할 새 API 키 입력" : "sk-ant-…"} /></label>
    <p>키는 서버에 암호화해 저장하며 원문을 다시 표시하지 않습니다. Sonnet 이용료는 입력한 키의 계정에 청구됩니다.</p>
    {issue ? <p role="alert">{issue}</p> : null}
    <div><Button type="submit" disabled={pending || !AgentApiKeySchema.safeParse(key.trim()).success}>{pending ? "저장 중…" : configured ? "키 교체" : "키 등록"}</Button>{configured ? <Button type="button" variant="outline" disabled={pending} onClick={() => void save(true)}>등록된 키 삭제</Button> : null}</div>
  </form>;
}
