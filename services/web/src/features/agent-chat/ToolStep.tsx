import type { PropsWithChildren } from "react";
import { Icon } from "@/components/ui/Icon";
import styles from "./ToolStep.module.css";

export type ToolStepStatus = "running" | "complete" | "failed";
const STATUS_LABEL: Record<ToolStepStatus, string> = { running: "실행 중", complete: "완료", failed: "실패" };

/**
 * 작업 흔적의 한 단계. 왼쪽 점이 상태를, 점 사이 세로선이 순서를 그린다.
 * 실행 중에는 점 둘레가 돌고 이름에 빛이 지나가며, 끝나면 점이 체크(실패면 x)로 바뀐다.
 * 도메인을 모른다 — 어떤 아이콘 · 이름 · 요약을 줄지는 화면이 정한다.
 */
export function ToolStep({ status, icon, title, summary, children }: PropsWithChildren<{ status: ToolStepStatus; icon: string; title: string; summary?: string | undefined }>) {
  return <div className={styles.step} data-status={status}>
    <span className={styles.node} role="img" aria-label={STATUS_LABEL[status]}>
      {/* 상태가 바뀌면 새로 붙어 등장 모션을 다시 탄다. */}
      <Icon key={status} className={styles.glyph} name={status === "complete" ? "check" : status === "failed" ? "x" : icon} weight={status === "running" ? "regular" : "bold"} size={11} />
    </span>
    <div className={styles.body}>
      <span className={`${styles.title} ${status === "running" ? "ex-anim-shimmer" : ""}`}>{title}</span>
      {summary ? <p key={status} className={styles.summary}>{summary}</p> : null}
      {children ? <div className={styles.detail}>{children}</div> : null}
    </div>
  </div>;
}
