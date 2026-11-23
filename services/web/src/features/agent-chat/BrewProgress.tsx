"use client";
import { useState } from "react";
import type { AgentConversation } from "@expresso/contracts";
import { Icon } from "@/components/ui/Icon";
import styles from "./BrewProgress.module.css";

/** 최신 제작의 행동을 입력창 옆에 유지한다. 과거 카드는 이력으로 보존한다. */
export function BrewProgress({ conversation, disabled, onInterview, onDesign, onResume }: {
  conversation: AgentConversation | null; disabled: boolean;
  onInterview(id: string): Promise<void>; onDesign(id: string): Promise<void>; onResume(id: string): Promise<unknown>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tools = conversation?.messages.flatMap(message => message.tools) ?? [];
  const latest = tools.findLast(tool => tool.brewMaterials || tool.brewInterview || tool.brewDesign || tool.brewGeneration);
  const brewId = latest?.brewGeneration?.brewId ?? latest?.brewDesign?.brewId ?? latest?.brewInterview?.brewId ?? latest?.brewMaterials?.brewId;
  if (!brewId) return null;
  const index = latest?.brewGeneration ? 3 : latest?.brewDesign ? 2 : latest?.brewInterview ? 1 : 0;
  const labels = ["기록 선택", "경험 정리", "디자인", "포트폴리오"];
  const perform = async () => {
    setBusy(true); setError(null);
    try { if (index === 0) await onInterview(brewId); else if (index === 1) await onDesign(brewId); else await onResume(brewId); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "이어서 진행하지 못했습니다."); }
    finally { setBusy(false); }
  };
  return <section className={styles.root} aria-label="포트폴리오 제작 진행">
    <div className={styles.line}>
      <ol className={styles.steps}>{labels.map((label, at) => <li key={label} data-state={at < index ? "done" : at === index ? "current" : "next"} aria-current={at === index ? "step" : undefined}>{at < index ? <Icon name="check" size={12} /> : <span>{at + 1}</span>}{label}</li>)}</ol>
      <button type="button" disabled={disabled || busy} onClick={() => void perform()} aria-busy={busy}>{busy ? "준비 중…" : index === 0 ? "선택한 기록으로 계속" : index === 1 ? "디자인으로 넘어가기" : "이어서 보기"}<Icon name="arrow-right" size={13} /></button>
    </div>
    {error ? <p role="alert" className={styles.error}>{error}</p> : null}
  </section>;
}
