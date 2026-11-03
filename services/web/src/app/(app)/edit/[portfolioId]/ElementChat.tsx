"use client";

import { useActionState, useState } from "react";

import { Icon } from "@/components/ui/Icon";

import { instructElementAction, restorePageAction, type ElementInstructResult } from "./edit-actions";
import styles from "./page.module.css";

/**
 * 04 채팅 탭 — 고른 요소 하나를 말로 고친다.
 *
 * 지시는 바로 새 판이 된다. 답에는 바뀐 곳(전 → 후)이 붙고, 「되돌리기」는 지시 바로 앞 판을 새 판으로 다시 쌓는다.
 * 고른 요소 밖은 바뀌지 않는다(서버가 그 요소의 props · 글자 모양 · 글만 받는다).
 */
export function ElementChat({
  portfolioId,
  elementKey,
  label,
  revision,
}: {
  portfolioId: string;
  elementKey: string;
  label: string;
  revision: number;
}) {
  const [result, instruct, pending] = useActionState<ElementInstructResult, FormData>(instructElementAction, {});
  const [undone, undo, undoing] = useActionState(restorePageAction, {});
  const [kept, setKept] = useState<number | null>(null);
  const settled = result.revision !== undefined && (kept === result.revision || undone.revision !== undefined);

  return (
    <>
      <div className={styles.chat}>
        {result.instruction ? (
          <>
            <div className={styles.userTurn}>
              <span className={styles.targetChip}>
                <Icon name="cursor-click" size={10} color="var(--ex-fg-muted)" />
                <span className={styles.targetChipText}>{result.target}</span>
              </span>
              <div className={styles.userBubble}>{result.instruction}</div>
            </div>
            <div className={styles.aiTurn}>
              <span className={styles.aiAvatar}>
                <span className={styles.aiAvatarDot} />
              </span>
              <div className={styles.aiBody}>
                <div className={styles.aiNameRow}>
                  <span className={styles.aiName}>에스프레소</span>
                </div>
                <div className={styles.aiBubble}>{result.error ?? result.note}</div>
                {result.changes?.length ? (
                  <div className={styles.patch}>
                    <div className={styles.patchHead}>
                      <Icon name="git-diff" size={11} color="var(--ex-fg-muted)" />
                      <span className={styles.patchTitle}>바뀐 곳 {result.changes.length}</span>
                    </div>
                    <div className={styles.patchRows}>
                      {result.changes.map((row) => (
                        <div key={row.label} className={styles.patchRow}>
                          <span className={styles.patchLabel}>{row.label}</span>
                          <span className={styles.patchValues}>
                            <span className={styles.patchBefore}>{row.before || "없음"}</span>
                            <Icon name="arrow-right" size={9} color="var(--ex-border-firm)" />
                            <span className={styles.patchAfter}>{row.after || "없음"}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                {result.revision !== undefined && !settled ? (
                  <form action={undo} className={styles.patchActions}>
                    <input type="hidden" name="portfolioId" value={portfolioId} />
                    <input type="hidden" name="revision" value={result.revision - 1} />
                    <input type="hidden" name="expectedRevision" value={result.revision} />
                    <button type="submit" className={styles.revertButton} disabled={undoing}>
                      <Icon name="arrow-counter-clockwise" size={11} />
                      {undoing ? "되돌리는 중…" : "되돌리기"}
                    </button>
                    <button type="button" className={styles.keepButton} onClick={() => setKept(result.revision!)}>
                      <Icon name="check" size={11} />
                      그대로 두기
                    </button>
                  </form>
                ) : null}
                {undone.error ? <div className={styles.aiBubble}>{undone.error}</div> : null}
                {undone.revision !== undefined ? <div className={styles.aiBubble}>지시 앞 판으로 되돌렸습니다.</div> : null}
              </div>
            </div>
          </>
        ) : null}
      </div>

      <form action={instruct} className={styles.chatComposer}>
        <input type="hidden" name="portfolioId" value={portfolioId} />
        <input type="hidden" name="key" value={elementKey} />
        <input type="hidden" name="label" value={label} />
        <input type="hidden" name="expectedRevision" value={revision} />
        <div className={styles.quickRow}>
          <span className={styles.targetChip}>
            <Icon name="cursor-click" size={10} color="var(--ex-fg-muted)" />
            <span className={styles.targetChipText}>{label}</span>
          </span>
        </div>
        <div className={styles.inputBox}>
          <input
            name="instruction"
            onKeyDown={(event) => {
              // ⌘↵ · Ctrl↵로도 보낸다. 한글 조합 중의 Enter는 글자를 끝내는 것이다.
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && !event.nativeEvent.isComposing) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            className={styles.input}
            placeholder="이 문장 더 짧게"
            aria-label="편집 지시"
            required
          />
          <div className={styles.inputActions}>
            <span className={styles.inputShortcut}>⌘↵</span>
            <button type="submit" className={styles.inputSend} aria-label="보내기" disabled={pending}>
              <Icon name={pending ? "hourglass" : "arrow-up"} size={14} color="var(--ex-fg-on-accent)" />
            </button>
          </div>
        </div>
      </form>
    </>
  );
}
