"use client";

import { CareerDeleteImpactResponseSchema } from "@expresso/contracts";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Icon } from "@/components/ui/Icon";

import styles from "./views.module.css";

/** 지우려는 기록 묶음의 영향. 한 기록이면 그 기록을 쓰는 포트폴리오 수, 여러 기록이면 쓰이는 기록 수를 보인다. */
export interface RecordTrashImpact {
  /** 포트폴리오가 하나라도 근거로 쓰는 기록 수. */
  usedRecordCount: number;
  /** 기록마다 센 포트폴리오 수의 합. 한 기록일 때만 화면에 쓴다(여러 기록이면 같은 포트폴리오가 겹쳐 세인다). */
  portfolioCount: number;
}

/** 기록마다 영향을 받아 합친다. 하나라도 받지 못하면 `null` — 확인 없이 지우지 않게 한다. */
export async function loadDeleteImpacts(recordIds: readonly string[]): Promise<RecordTrashImpact | null> {
  try {
    const impacts = await Promise.all(recordIds.map(async (id) => {
      const response = await fetch(`/api/career/records/${id}/delete-impact`);
      if (!response.ok) throw new Error(`delete-impact ${response.status}`);
      return CareerDeleteImpactResponseSchema.parse(await response.json()).data;
    }));
    return {
      usedRecordCount: impacts.filter((impact) => impact.portfolioCount > 0).length,
      portfolioCount: impacts.reduce((sum, impact) => sum + impact.portfolioCount, 0),
    };
  } catch {
    return null;
  }
}

/** 휴지통으로 옮기기 전 확인 창. 옮긴 기록은 30일 동안 카테고리 휴지통에서 되살릴 수 있다(백엔드 보관 기간). */
export function RecordTrashConfirm({ open, title, count, impact, busy = false, onConfirm, onCancel }: {
  open: boolean;
  /** 한 기록일 때 보이는 제목. */
  title: string;
  count: number;
  impact: RecordTrashImpact;
  busy?: boolean;
  onConfirm(): void;
  onCancel(): void;
}) {
  // 제목은 사용자가 쓴 말이라 조사(을/를)를 붙이지 않는다. 제목은 본문 첫 줄에 따로 보인다.
  const question = count === 1 ? "이 기록을 휴지통으로 옮길까요?" : `기록 ${count}개를 휴지통으로 옮길까요?`;
  const usage = impact.usedRecordCount === 0 ? null
    : count === 1 ? `포트폴리오 ${impact.portfolioCount}곳에서 이 기록을 근거로 씁니다.`
      : `선택한 기록 중 ${impact.usedRecordCount}개를 포트폴리오가 근거로 씁니다.`;
  return <Dialog open={open} onOpenChange={(next) => { if (!next && !busy) onCancel(); }}>
    <DialogContent className={styles.trashDialog} showCloseButton={false}>
      <DialogTitle className={styles.trashTitle}><Icon name="trash" size={16} />{question}</DialogTitle>
      <DialogDescription className={styles.trashConfirmText} render={<div />}>
        {count === 1 ? <strong>{title || "제목 없음"}</strong> : null}
        {usage ? <p data-tone="warning">{usage} 옮겨도 그 포트폴리오의 문장은 바뀌지 않습니다.</p> : null}
        <p>휴지통에서 30일 동안 복원할 수 있습니다.</p>
      </DialogDescription>
      <div className={styles.trashConfirmActions}>
        <button type="button" disabled={busy} onClick={onCancel}>취소</button>
        <button type="button" data-danger="true" disabled={busy} onClick={onConfirm}><Icon name="trash" size={13} />휴지통으로 옮기기</button>
      </div>
    </DialogContent>
  </Dialog>;
}
