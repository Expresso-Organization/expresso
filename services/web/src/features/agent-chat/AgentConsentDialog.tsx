"use client";
import { useState } from "react";
import { CONSENT_POLICY_VERSION, ConsentListResponseSchema } from "@expresso/contracts";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { LogoMark } from "@/components/brand/Logo";
import styles from "./AgentChat.module.css";
export function AgentConsentDialog({ open, onOpenChange, onConsented }: { open: boolean; onOpenChange(open: boolean): void; onConsented(): void }) {
  const [pending, setPending] = useState(false);
  const [issue, setIssue] = useState<string | null>(null);
  async function agree() {
    if (pending) return;
    setPending(true); setIssue(null);
    try {
      const response = await fetch("/api/agent/consent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scopes: ["career_records"], policyVersion: CONSENT_POLICY_VERSION }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "동의를 저장하지 못했습니다.");
      const result = ConsentListResponseSchema.parse(payload);
      if (!result.data.consents.some(item => item.scope === "career_records" && item.granted)) throw new Error("동의 상태를 확인하지 못했습니다.");
      onConsented(); onOpenChange(false);
    } catch (error) { setIssue(error instanceof Error ? error.message : "동의를 저장하지 못했습니다. 다시 시도해 주세요."); }
    finally { setPending(false); }
  }
  return <Dialog open={open} onOpenChange={next => { if (!pending) { setIssue(null); onOpenChange(next); } }}>
    <DialogContent className={`acf-scope ${styles.consentDialog}`} showCloseButton={false}>
      <DialogHeader><LogoMark size={30} /><DialogTitle>Expresso AI 사용 동의</DialogTitle><DialogDescription>대화를 시작하기 전에, AI에 전달되는 정보를 확인해 주세요.</DialogDescription></DialogHeader>
      <div className={styles.consentDetails}><strong>대화와 커리어 기록 사용</strong><p>입력한 대화와 연결한 커리어 기록을 Anthropic의 Claude 모델에 전달합니다. 답변과 기록의 변경 제안을 만드는 데 사용합니다.</p><p>동의는 선택 사항이며 설정에서 언제든 철회할 수 있습니다. 동의하지 않으면 AI 채팅 전송이 제한됩니다.</p><p>이 동의는 기존 ‘커리어 기록 사용’ 동의와 함께 관리됩니다. 기록 변경은 제안을 확인하고 승인해야 적용됩니다.</p></div>
      {issue ? <p role="alert" className={styles.error}>{issue}</p> : null}
      <DialogFooter><Button variant="ghost" disabled={pending} onClick={() => onOpenChange(false)}>나중에</Button><Button disabled={pending} onClick={() => void agree()}>{pending ? "저장 중…" : "동의하고 시작"}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
