"use client";

import { CareerRevisionsResponseSchema, type CareerRevision } from "@expresso/contracts";
import { useCallback, useState } from "react";

import { Icon } from "@/components/ui/Icon";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";

import { useCareerEditorSession } from "../session/useCareerEditorSession";
import styles from "./RevisionHistory.module.css";

const TIME = new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** 이력 행의 이름입니다. 스냅샷이 어느 시점의 본문인지에 맞춥니다. */
export function revisionLabel(revision: Pick<CareerRevision, "actor" | "summary">): string {
  if (revision.actor === "ai") return "AI 적용 전";
  if (revision.summary === "리비전 복원") return "복원";
  return revision.summary;
}

type ListState = { status: "idle" | "loading" | "failed" } | { status: "ready"; data: CareerRevision[] };

export function RevisionHistory({ recordId, className }: { recordId: string; className?: string | undefined }) {
  const { snapshot } = useCareerEditorSession(recordId);
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<ListState>({ status: "idle" });
  const [restoring, setRestoring] = useState<string | null>(null);

  const load = useCallback(async () => {
    setList({ status: "loading" });
    const response = await fetch(`/api/career/records/${encodeURIComponent(recordId)}/revisions`, { cache: "no-store" }).catch(() => null);
    const parsed = response?.ok ? CareerRevisionsResponseSchema.safeParse(await response.json().catch(() => null)) : null;
    setList(parsed?.success ? { status: "ready", data: parsed.data.data.filter((row) => row.snapshotId) } : { status: "failed" });
  }, [recordId]);

  const restore = async (revision: CareerRevision) => {
    setRestoring(revision.id);
    const response = await fetch(`/api/career/records/${encodeURIComponent(recordId)}/revisions/${encodeURIComponent(revision.id)}/restore`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expectedVersion: snapshot.documentVersion }),
    }).catch(() => null);
    setRestoring(null);
    // 성공하면 본문은 WebSocket으로 편집기에 들어옵니다. 목록에는 새 「복원」 행이 생깁니다.
    // 409는 그 사이 본문이 바뀌었다는 뜻이라 최신 목록을 다시 보여 줍니다.
    if (response?.ok || response?.status === 409) await load();
    else setList({ status: "failed" });
  };

  // 저장이 끝나지 않은 동안 복원하면 버전이 어긋나므로 저장된 상태에서만 복원합니다.
  const canRestore = snapshot.status === "saved" && restoring === null;
  return (
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (next) void load(); }}>
      <PopoverTrigger className={[styles.trigger, className].filter(Boolean).join(" ")}>
        <Icon name="clock-counter-clockwise" size={14} />이력
      </PopoverTrigger>
      <PopoverContent className={styles.panel} align="end" sideOffset={8}>
        <PopoverTitle className={styles.title}>이력</PopoverTitle>
        {list.status === "ready" && list.data.length ? (
          <ol className={styles.list}>
            {list.data.map((revision) => (
              <li key={revision.id} className={styles.row} data-actor={revision.actor}>
                <Icon name={revision.actor === "ai" ? "sparkle" : revision.summary === "리비전 복원" ? "arrow-counter-clockwise" : "pencil-simple"} size={13} className={styles.rowIcon} />
                <span className={styles.rowCopy}>
                  <span className={styles.rowLabel}>{revisionLabel(revision)}</span>
                  <time className={styles.rowTime} dateTime={revision.createdAt}>{TIME.format(new Date(revision.createdAt))}</time>
                </span>
                <button type="button" className={styles.restore} disabled={!canRestore} aria-busy={restoring === revision.id} onClick={() => void restore(revision)}>복원</button>
              </li>
            ))}
          </ol>
        ) : list.status === "failed" ? (
          <p className={styles.notice} role="alert">이력을 불러오지 못했습니다. <button type="button" className={styles.retry} onClick={() => void load()}>다시 시도</button></p>
        ) : list.status === "loading" || list.status === "idle" ? (
          <p className={styles.notice} aria-busy="true">불러오는 중</p>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
