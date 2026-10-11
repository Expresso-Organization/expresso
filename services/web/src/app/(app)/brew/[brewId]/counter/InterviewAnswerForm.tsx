"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CareerWriteOperation } from "@expresso/contracts";
import { Icon } from "@/components/ui/Icon";
import { WriteOperationStatus } from "@/features/career-editor/write-operations/WriteOperationStatus";
import { durableWriteKey, savedOperation, saveOperation } from "@/features/career-editor/write-operations/write-operation-client";
import type { answerQuestionAction } from "../brew-actions";
import styles from "./page.module.css";
export function InterviewAnswerForm({ brewId, sessionId, questionId, submit, pendingOperation }: {
  brewId: string; sessionId: string; questionId: string; submit: typeof answerQuestionAction; pendingOperation?: CareerWriteOperation | undefined;
}) {
  const router = useRouter();
  const scope = "interview:" + brewId + ":" + sessionId + ":" + questionId;
  const [transcript, setTranscript] = useState("");
  const [busy, setBusy] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [issue, setIssue] = useState<string | null>(null);
  const [pending, setPending] = useState<{ id: string; initial?: CareerWriteOperation } | null>(null);
  const context = useRef({ scope });
  if (context.current.scope !== scope) context.current = { scope };
  useEffect(() => {
    setTranscript(""); setBusy(false); setCompleted(false); setIssue(null);
    const id = savedOperation(scope); setPending(pendingOperation ? { id: pendingOperation.operationId, initial: pendingOperation } : id ? { id } : null);
    return () => { context.current = { scope: context.current.scope }; };
  }, [scope, pendingOperation?.operationId]);
  async function send(form: FormData) {
    if (busy || pending || completed) return;
    const requestContext = context.current;
    setBusy(true); setIssue(null);
    try {
      const input = { inputType: "text", transcript: transcript.trim() };
      form.set("idempotencyKey", await durableWriteKey(scope, input));
      if (requestContext !== context.current) return;
      const result = await submit(form);
      if (requestContext !== context.current) return;
      if (!result) throw new Error("답변 내용을 확인해 주세요.");
      if ("operationId" in result.data) {
        if (result.data.producer !== "interview") throw new Error("답변 작업을 확인하지 못했습니다.");
        saveOperation(scope, result.data.operationId);
        setPending({ id: result.data.operationId, initial: result.data });
      } else { setCompleted(true); router.refresh(); }
    } catch (error) { if (requestContext === context.current) setIssue(error instanceof Error ? error.message : "답변을 저장하지 못했습니다."); }
    finally { if (requestContext === context.current) setBusy(false); }
  }
  return <form action={send} className={styles.composer}>
    <input type="hidden" name="brewId" value={brewId} /><input type="hidden" name="sessionId" value={sessionId} /><input type="hidden" name="questionId" value={questionId} />
    {pending ? <WriteOperationStatus key={pending.id} operationId={pending.id} initial={pending.initial} scope={scope} producer="interview" onCompleted={() => { setCompleted(true); router.refresh(); }} /> : null}
    {issue ? <p role="alert">{issue}</p> : null}
    <div className={styles.inputBox}>
      <textarea name="transcript" className={styles.textarea} placeholder="떠오르는 대로 적어도 됩니다. 문장은 제가 다듬을게요." aria-label="답변" required value={transcript} disabled={busy || pending !== null || completed} onChange={event => setTranscript(event.target.value)} />
      <div className={styles.inputActions}><span className={styles.inputHint}>적은 그대로 기록에 남습니다 — 없는 수치를 채우지 않습니다</span>
        <button type="submit" className={styles.send} disabled={busy || pending !== null || completed || !transcript.trim()}>보내기<Icon name="arrow-up" size={13} /></button>
      </div>
    </div>
  </form>;
}