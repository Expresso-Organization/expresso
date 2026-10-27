"use client";

import type { StructuredPortfolioSnapshot } from "@expresso/contracts";
import { useActionState, useState, useTransition } from "react";

import { Icon } from "@/components/ui/Icon";

import { addRecordSectionAction } from "./edit-actions";
import styles from "./page.module.css";

export interface LibraryRecord {
  id: string;
  title: string;
  category: string;
  period: string | null;
}

/**
 * 04 왼쪽 기록 목록. 내 커리어 기록을 갈래별로 보이고, 이 지면에 쓰인 기록은 표시한다. 쓰이지 않은 기록을 더하면 그 기록으로
 * 쓴 사례가 다른 사례 뒤, 경력 · 근거 자료 · 연락처 앞에 새 판으로 들어온다.
 */
export function RecordLibrary({
  records,
  snapshot,
  portfolioId,
  revision,
}: {
  /** 읽지 못했으면 null이다. */
  records: readonly LibraryRecord[] | null;
  snapshot: StructuredPortfolioSnapshot;
  portfolioId: string;
  revision: number;
}) {
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState<string | null>(null);
  const [state, add, pending] = useActionState(addRecordSectionAction, {});
  const [, startTransition] = useTransition();
  const used = new Set([
    ...snapshot.content.sections.flatMap((section) => [section.id, ...section.sourceIds]),
    ...snapshot.content.evidence.map((item) => item.id),
  ]);
  const needle = query.trim().toLowerCase();
  const shown = (records ?? []).filter((record) => !needle || record.title.toLowerCase().includes(needle));
  const groups = [...new Set(shown.map((record) => record.category))];

  function addRecord(id: string) {
    const form = new FormData();
    form.set("portfolioId", portfolioId);
    form.set("recordId", id);
    form.set("expectedRevision", String(revision));
    setAdding(id);
    startTransition(() => add(form));
  }

  return (
    <div className={styles.library}>
      <input
        type="search"
        className={styles.textInput}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="기록 제목"
        aria-label="기록 찾기"
      />
      {state.error ? <p className={styles.sectionError}>{state.error}</p> : null}
      {records === null ? <p className={styles.sectionError}>기록을 불러오지 못했습니다.</p> : null}
      {groups.map((group) => (
        <section key={group} className={styles.libraryGroup} aria-label={group}>
          <span className={styles.sectionsLabel}>{group}</span>
          {shown.filter((record) => record.category === group).map((record) => {
            const isUsed = used.has(record.id);
            const busy = pending && adding === record.id;
            return (
              <div key={record.id} className={`${styles.sectionRow} ${isUsed ? styles.libraryUsed : ""}`}>
                <span className={styles.outlineText}>
                  <span className={styles.sectionTitle}>{record.title}</span>
                  {record.period ? <span className={styles.sectionMeta}>{record.period}</span> : null}
                </span>
                {isUsed ? (
                  <span role="img" aria-label="지면에 있음"><Icon name="check" size={13} color="var(--ex-status-success-text)" /></span>
                ) : (
                  <button
                    type="button"
                    className={styles.iconAction}
                    aria-label={`${record.title} 지면에 더하기`}
                    disabled={pending}
                    onClick={() => addRecord(record.id)}
                  >
                    <Icon name={busy ? "hourglass" : "plus"} size={13} color="var(--ex-fg-muted)" />
                  </button>
                )}
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}
