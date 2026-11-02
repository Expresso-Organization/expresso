"use client";

import type { CareerRecord } from "@expresso/contracts";
import { useEffect, useRef, useState } from "react";
import { propertyMutationHint } from "./canonical-values";

export function PropertyMutationNotice({ record, onResumePropertyMutation, onCheckPropertyMutation }: {
  record: CareerRecord;
  onResumePropertyMutation?(jobId: string): Promise<void>;
  onCheckPropertyMutation?(jobId: string): Promise<void>;
}) {
  const [action, setAction] = useState<"resume" | "check" | null>(null);
  const [issue, setIssue] = useState("");
  const lifetime = useRef(0);
  const hint = propertyMutationHint(record);
  const pending = record.pendingPropertyMutation;
  useEffect(() => {
    lifetime.current++; setAction(null); setIssue("");
    return () => { lifetime.current++; };
  }, [pending?.jobId]);
  async function run(kind: "resume" | "check", callback: (jobId: string) => Promise<void>, jobId: string) {
    const current = lifetime.current;
    setAction(kind); setIssue("");
    try { await callback(jobId); }
    catch (error) { if (current === lifetime.current) setIssue(error instanceof Error ? error.message : "작업 상태를 확인하지 못했습니다."); }
    finally { if (current === lifetime.current) setAction(null); }
  }
  if (!hint || !pending) return null;
  return <div>
    <p role="status" aria-label="속성 변경 상태">{hint}</p>
    {pending.retryable && onResumePropertyMutation ? <button type="button" disabled={action !== null} onClick={() => void run("resume", onResumePropertyMutation, pending.jobId)}>{action === "resume" ? "다시 시작하는 중" : "속성 변경 다시 시작"}</button> : null}
    {onCheckPropertyMutation ? <button type="button" disabled={action !== null} onClick={() => void run("check", onCheckPropertyMutation, pending.jobId)}>{action === "check" ? "상태 확인 중" : "속성 변경 상태 다시 확인"}</button> : null}
    {issue ? <p role="alert">{issue}</p> : null}
  </div>;
}