"use client";
import { useState } from "react";
import { CONSENT_POLICY_VERSION, ConsentListResponseSchema } from "@expresso/contracts";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/Icon";
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
      <DialogHeader className={styles.consentHeader}>
        <div className={styles.consentBrand}><span><LogoMark size={28} /></span><div>Expresso AI<small>내 기록에서, 다음 기회까지</small></div></div>
        <DialogTitle className={styles.consentTitle}>대화를 시작하기 전에</DialogTitle>
        <DialogDescription className={styles.consentIntro}>AI가 내 경험을 이해하고 답할 수 있도록,<br />아래 정보의 사용에 동의해 주세요.</DialogDescription>
      </DialogHeader>
      <div className={styles.consentBody}>
        <dl className={styles.consentFacts}>
          <div><Icon name="chat-teardrop-text" size={20} /><div><dt>전달되는 정보</dt><dd>입력한 대화와 연결한 커리어 기록</dd></div></div>
          <div><Icon name="sparkle" size={20} /><div><dt>정보를 사용하는 곳</dt><dd>Anthropic의 Claude 모델<small>답변과 기록 변경 제안을 만드는 데 사용합니다.</small></dd></div></div>
          <div><Icon name="check-square" size={20} /><div><dt>기록에 반영하는 순간</dt><dd>변경 제안을 직접 확인하고 승인한 뒤</dd></div></div>
        </dl>
        <div className={styles.consentChoice}><Icon name="shield-check" size={18} /><p>동의는 선택이며, 설정에서 언제든 철회할 수 있습니다.<small>동의하지 않으면 AI 채팅 전송이 제한됩니다.</small></p></div>
        {issue ? <p role="alert" className={styles.error}>{issue}</p> : null}
      </div>
      <DialogFooter className={styles.consentFooter}>
        <p>기존 ‘커리어 기록 사용’ 동의와 함께 관리됩니다.</p>
        <div><Button variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>나중에</Button><Button className={styles.consentAccept} disabled={pending} onClick={() => void agree()}>{pending ? "저장 중…" : "동의하고 시작"}<Icon name="arrow-right" size={16} /></Button></div>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
