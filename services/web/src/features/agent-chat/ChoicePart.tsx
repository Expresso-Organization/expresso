"use client";
import { useState } from "react";
import type { AgentChoicePart } from "@expresso/contracts";
import { Icon } from "@/components/ui/Icon";
import styles from "./ChoicePart.module.css";

/**
 * 선택지 부품. 에이전트의 질문과 선택지를 단추로 세운다.
 *
 * 하나만 고르는 질문은 누르는 즉시 답을 보낸다. 여럿을 고르는 질문은 고른 뒤 「보내기」를 누른다.
 * 답한 부품과 지나간 부품(`interactive`가 거짓)은 누를 수 없다 — 답한 부품은 고른 것을 표시한다.
 */
export function ChoicePart({ part, interactive, onAnswer }: {
  part: AgentChoicePart;
  /** 지금 답을 받을 수 있는가. 마지막 답변의 답 없는 부품이고, 실행 중이 아니며, 보낼 수 있는 상태일 때만 참이다. */
  interactive: boolean;
  onAnswer(optionIds: string[]): Promise<unknown>;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const answered = part.answer?.optionIds ?? null;
  const open = interactive && !answered && !sending;
  const chosen = answered ?? picked;
  const submit = async (optionIds: string[]) => {
    if (!open || !optionIds.length) return;
    setSending(true); setError(null);
    try { await onAnswer(optionIds); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "답을 보내지 못했습니다."); }
    finally { setSending(false); }
  };
  const press = (id: string) => {
    if (!open) return;
    if (!part.multiple) { setPicked([id]); void submit([id]); return; }
    setPicked(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
  };
  const state = answered ? "answered" : interactive ? "open" : "closed";
  return <section className={styles.part} data-state={state} aria-label="선택지 질문">
    <p className={styles.prompt}>{part.prompt}</p>
    <ul className={styles.options} role={part.multiple ? "group" : "radiogroup"} aria-label={part.prompt}>
      {part.options.map(option => {
        const selected = chosen.includes(option.id);
        return <li key={option.id}>
          <button type="button" className={styles.option} role={part.multiple ? "checkbox" : "radio"} aria-checked={selected} data-selected={selected || undefined} disabled={!open} onClick={() => press(option.id)}>
            <span className={styles.mark} aria-hidden="true">{selected ? <Icon name="check" size={12} /> : null}</span>
            <span className={styles.text}><span className={styles.label}>{option.label}</span>{option.description ? <span className={styles.description}>{option.description}</span> : null}</span>
          </button>
        </li>;
      })}
    </ul>
    {part.multiple && !answered ? <div className={styles.actions}>
      <button type="button" className={styles.send} disabled={!open || !picked.length} onClick={() => void submit(part.options.filter(option => picked.includes(option.id)).map(option => option.id))}>{sending ? "보내는 중…" : "보내기"}</button>
      <span className={styles.hint}>여럿을 고를 수 있습니다.</span>
    </div> : null}
    {state === "closed" && !sending ? <p className={styles.note}>지나간 질문입니다.</p> : null}
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
  </section>;
}

/** 선택지를 준비하는 동안과, 선택지를 내지 못했을 때의 자리. 부품이 생겨도 자리가 바뀌지 않게 같은 곳에 그린다. */
export function ChoicePartPending({ failed }: { failed: boolean }) {
  if (failed) return null;
  return <p className={`${styles.pending} ex-anim-shimmer`} role="status">선택지를 준비하고 있습니다.</p>;
}
