"use client";
import { useState } from "react";
import type { AgentPageEdit } from "@expresso/contracts";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/button";
import styles from "./PageEditCard.module.css";

/**
 * 에이전트가 지면 요소를 고쳐 저장한 새 판.
 *
 * 바뀐 곳을 전 → 후로 보이고, 이 판이 아직 최신이면 「되돌리기」로 바로 앞 판의 내용을 새 판으로 쌓는다. 그 뒤에 다른 판이
 * 쌓였으면(`latest === false`) 덮지 않도록 버튼을 막는다. 최신인지 모르는 화면(`latest === undefined`)에서는 서버가 막는다.
 * 되돌리기는 AI를 부르지 않는다.
 */
export function PageEditCard({ edit, latest, disabled, onUndo }: { edit: AgentPageEdit; latest?: boolean | undefined; disabled: boolean; onUndo(): Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const undo = async () => {
    setBusy(true); setError(null);
    try { await onUndo(); } catch (cause) { setError(cause instanceof Error ? cause.message : "되돌리지 못했습니다."); } finally { setBusy(false); }
  };
  return <section className={styles.card} aria-label="지면 고침">
    <header className={styles.head}>
      <Icon name="git-diff" size={14} />
      <span className={styles.title}>{edit.label}</span>
      <span className={styles.count}>바뀐 곳 {edit.changes.length}</span>
    </header>
    <ul className={styles.rows}>
      {edit.changes.map((row, index) => <li key={`${row.label}:${index}`} className={styles.row}>
        <span className={styles.label}>{row.label}</span>
        <span className={styles.values}>
          <span className={styles.before}>{row.before || "없음"}</span>
          <Icon name="arrow-right" size={10} />
          <span className={styles.after}>{row.after || "없음"}</span>
        </span>
      </li>)}
    </ul>
    {error ? <p role="alert" className={styles.error}>{error}</p> : null}
    {edit.undone
      ? <p className={styles.done}><Icon name="arrow-counter-clockwise" size={13} />앞 판으로 되돌렸습니다.</p>
      : <div className={styles.actions}>
        {latest === false ? <span className={styles.hint}>그 뒤에 다른 편집이 있어 되돌릴 수 없습니다.</span> : <span className={styles.hint}>판 {edit.revision + 1}에 저장했습니다.</span>}
        <Button variant="outline" size="sm" disabled={busy || disabled || latest === false} onClick={() => void undo()}>
          <Icon name="arrow-counter-clockwise" size={12} />{busy ? "되돌리는 중…" : "되돌리기"}
        </Button>
      </div>}
  </section>;
}
