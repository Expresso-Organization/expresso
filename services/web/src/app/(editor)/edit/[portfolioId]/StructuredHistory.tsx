"use client";

import { PAGE_REVERTIBLE_CHANGE_KINDS, type GeneratedPage, type PageChange } from "@expresso/contracts";
import { startTransition, useActionState, useEffect, useState } from "react";

import { Icon } from "@/components/ui/Icon";

import { restorePageAction, revertPageAction } from "./edit-actions";
import styles from "./page.module.css";


const FILTERS: ReadonlyArray<{ key: PageChange["actor"] | null; label: string }> = [
  { key: null, label: "전체" },
  { key: "ai", label: "AI 편집" },
  { key: "user", label: "직접 편집" },
];

/** 이력을 날짜로 묶는 이름. 오늘 · 어제 · 그 밖은 월일. */
function dayLabel(at: string, today: Date): string {
  const day = new Date(at);
  const start = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const diff = Math.round((start(today) - start(day)) / 86_400_000);
  if (diff === 0) return "오늘";
  if (diff === 1) return "어제";
  return day.toLocaleDateString("ko-KR", { month: "long", day: "numeric" });
}

function relative(at: string, now: number): string {
  const minutes = Math.max(0, Math.round((now - new Date(at).getTime()) / 60_000));
  if (minutes < 1) return "방금";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.round(hours / 24)}일 전`;
}

/**
 * 되돌릴 수 있는 지점. 가장 최근 생성 직후, 그 뒤 처음 다듬은 직후, 그 뒤 처음 직접 고치기 직전의 판이다. 같은 판을 두 번 두지
 * 않고, 지금 보는 판은 돌아갈 곳이 아니라 빼 둔다.
 */
function checkpoints(pages: readonly GeneratedPage[]): { label: string; page: GeneratedPage }[] {
  const ascending = [...pages].reverse();
  const generated = pages.find((page) => page.change?.kind === "generated");
  if (!generated) return [];
  const after = ascending.filter((page) => page.revision > generated.revision);
  const refined = after.find((page) => page.change?.kind === "refined");
  const firstUser = after.find((page) => page.change?.actor === "user");
  const beforeUser = firstUser ? ascending.find((page) => page.revision === firstUser.revision - 1) : undefined;
  const points = [
    { label: "AI 생성 직후", page: generated },
    ...(refined ? [{ label: "AI가 다듬은 직후", page: refined }] : []),
    ...(beforeUser ? [{ label: "직접 편집 시작 전", page: beforeUser }] : []),
  ];
  const current = pages[0]?.revision;
  return points.filter((point, index) => point.page.revision !== current && points.findIndex((other) => other.page.revision === point.page.revision) === index);
}

/**
 * 04c 이력 탭(구조화 지면) — AI가 고친 것과 내가 고친 것을 나눠서 되돌린다.
 *
 * 판마다 서버가 무엇을 바꿨는지(`change`)를 싣는다. 줄을 누르면 그 변경이 닿은 요소를 지면에서 고르고, 「되돌리기」는 그 변경
 * 하나만 무른 새 판을 쌓는다. 그 뒤에 같은 자리를 또 고쳤으면 한 번 묻고, 다시 누르면 덮는다.
 */
export function StructuredHistoryPanel({
  pages,
  portfolioId,
  displayName,
  elementKeys,
  onPick,
}: {
  /** 최신 판이 먼저인 판 목록. */
  pages: readonly GeneratedPage[];
  portfolioId: string;
  displayName: string;
  /** 지금 지면에 있는 요소 키. 사라진 요소는 고를 수 없다. */
  elementKeys: ReadonlySet<string>;
  onPick: (key: string) => void;
}) {
  const [revertState, revert, reverting] = useActionState(revertPageAction, {});
  const [restoreState, restore, restoring] = useActionState(restorePageAction, {});
  const [filter, setFilter] = useState<PageChange["actor"] | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  /** 날짜 묶음과 「N분 전」의 기준 시각. 렌더마다 시계를 읽지 않고, 판 목록이 바뀔 때만 다시 읽는다. */
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { setNow(Date.now()); }, [pages]);

  const current = pages[0]?.revision ?? 0;
  const busy = reverting || restoring;
  const asked = revertState.conflict ?? null;
  const shown = pages.filter((page) => filter === null || page.change?.actor === filter);
  const today = new Date(now);
  const groups: { label: string; pages: GeneratedPage[] }[] = [];
  for (const page of shown) {
    const label = dayLabel(page.createdAt, today);
    const last = groups.at(-1);
    if (last?.label === label) last.pages.push(page);
    else groups.push({ label, pages: [page] });
  }

  function send(action: (form: FormData) => void, fields: Record<string, string | number>) {
    const form = new FormData();
    form.set("portfolioId", portfolioId);
    for (const [name, value] of Object.entries(fields)) form.set(name, String(value));
    startTransition(() => action(form));
  }

  const error = revertState.error ?? restoreState.error;

  return (
    <div className={styles.history}>
      <div className={styles.historyFilters} role="group" aria-label="이력 종류">
        {FILTERS.map((item) => (
          <button
            key={item.label}
            type="button"
            aria-pressed={filter === item.key}
            onClick={() => setFilter(item.key)}
            className={`${styles.historyFilter} ${filter === item.key ? styles.historyFilterActive : ""}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {error ? <p className={styles.panelError}>{error}</p> : null}
      {asked !== null ? (
        <p className={styles.panelError}>그 뒤에 이 자리를 또 고쳤습니다. 되돌리면 그 편집이 사라집니다 — 한 번 더 누르면 그때는 덮습니다.</p>
      ) : null}

      {shown.length === 0 ? (
        <div className={styles.revisionMeta}>{filter === "ai" ? "AI가 고친 이력이 없습니다" : filter === "user" ? "직접 고친 이력이 없습니다" : "아직 변경 이력이 없습니다"}</div>
      ) : null}

      {groups.map((group) => (
        <div key={group.label}>
          <div className={styles.historyDay}>{group.label}</div>
          {group.pages.map((page) => {
            const change = page.change;
            const target = change?.keys.find((key) => elementKeys.has(key)) ?? null;
            const revertible = page.revision !== current && change !== undefined && PAGE_REVERTIBLE_CHANGE_KINDS.has(change.kind);
            const body = (
              <>
                <div className={styles.revisionSummary}>{change?.summary ?? `판 ${page.revision + 1}`}</div>
                <div className={styles.revisionMeta}>
                  {relative(page.createdAt, now)}
                  {page.revision === current ? " · 지금 보는 상태" : ""}
                </div>
              </>
            );
            return (
              <div key={page.id} className={`${styles.revision} ${picked === page.id ? styles.revisionPicked : ""}`}>
                {change?.actor === "user" ? (
                  <span className={styles.revisionUser} aria-label={`${displayName} 직접 편집`}>{displayName.slice(0, 1)}</span>
                ) : (
                  <span className={styles.revisionAi} aria-label="AI 편집">
                    <Icon name="coffee" weight="fill" size={11} color="var(--ex-accent-surface)" />
                  </span>
                )}
                {target ? (
                  <button
                    type="button"
                    className={`${styles.revisionBody} ${styles.revisionPick}`}
                    aria-pressed={picked === page.id}
                    onClick={() => { setPicked(page.id); onPick(target); }}
                  >
                    {body}
                  </button>
                ) : (
                  <div className={styles.revisionBody}>{body}</div>
                )}
                {revertible ? (
                  <button
                    type="button"
                    className={styles.revisionRevert}
                    disabled={busy}
                    onClick={() => send(revert, { revision: page.revision, expectedRevision: current, ...(asked === page.revision ? { force: "true" } : {}) })}
                  >
                    {asked === page.revision ? "그래도 되돌리기" : "되돌리기"}
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      ))}

      {checkpoints(pages).length ? <div className={styles.checkpointHead}>되돌릴 수 있는 지점</div> : null}
      {checkpoints(pages).map(({ label, page }) => (
        <div key={label} className={styles.checkpoint}>
          <Icon name="flag" size={13} color="var(--ex-fg-muted)" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className={styles.checkpointName}>{label}</div>
            <div className={styles.checkpointAt}>
              {new Date(page.createdAt).toLocaleString("ko-KR", { month: "long", day: "numeric", hour: "numeric", minute: "2-digit" })}
            </div>
          </div>
          <button
            type="button"
            className={styles.checkpointRestore}
            disabled={busy}
            onClick={() => send(restore, { revision: page.revision, expectedRevision: current })}
          >
            복원
          </button>
        </div>
      ))}
    </div>
  );
}
