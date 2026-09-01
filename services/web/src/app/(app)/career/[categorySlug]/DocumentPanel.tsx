"use client";

import type { CareerCategory, CareerRecordListItem } from "@expresso/contracts";

import { Icon } from "@/components/ui/Icon";
import { CareerDocumentEditor } from "@/features/career-editor/editor/CareerDocumentEditor";

import styles from "./DocumentPanel.module.css";

/** 05 카테고리별 빠른 액션. 첫 항목만 시그니처 지면을 쓴다. */
const QUICK_ACTIONS: Record<string, readonly string[]> = {
  experience: ["이어서 질문받기", "성과를 숫자로", "문장 다듬기", "STAR로 재구성"],
  project: ["성과를 숫자로", "기술 선택 이유 추가", "회고 쓰기"],
  education_history: ["성과 물어보기", "이력서 문장으로", "영문으로 번역"],
  certification_award: ["증빙 연결하기", "유효기간 확인", "영문 표기 정리"],
  academic_writing: ["스킬로 올리기", "요약 3문장", "영문으로 번역"],
  activity_leadership: ["성과를 숫자로", "규모 적어두기", "문장 다듬기"],
  skill_tool: ["숫자 연결하기", "비슷한 스킬 묶기", "영문 표기 정리"],
};

export function DocumentPanel({
  record,
  category,
  onClose,
  onExpand,
}: {
  record: CareerRecordListItem | null;
  category: CareerCategory;
  onClose: () => void;
  onExpand?: () => void;
}) {
  const quickActions = QUICK_ACTIONS[category.key] ?? QUICK_ACTIONS.experience!;

  return (
    <aside
      className={styles.panel}
      aria-label="문서 패널"
      /*
       * 넓은 화면에서 이 패널은 늘 자리에 있고 고른 기록이 없으면 빈 상태를
       * 보여 준다. 좁은 화면에서는 그럴 자리가 없어 **고른 것이 있을 때만**
       * 전면 시트로 올라온다. 어느 쪽인지는 CSS가 이 표시를 보고 정한다.
       */
      data-open={record ? "true" : "false"}
    >
      <div className={styles.head}>
        <button type="button" className={styles.headAction} aria-label="넓게 보기" disabled={!record || !onExpand} onClick={onExpand}>
          <Icon name="arrows-out-simple" size={15} />
        </button>
        <span className={styles.headLabel}>{category.name} · 문서</span>
        <div className={styles.headRight}>
          <span className={styles.headLabel}>{record ? "저장됨" : ""}</span>
          <button type="button" className={styles.headAction} aria-label="닫기" onClick={onClose}>
            <Icon name="x" size={15} />
          </button>
        </div>
      </div>

      {record === null ? (
        <div className={styles.none}>
          <p className={styles.noneText}>
            목록에서 기록을 고르면
            <br />
            여기에서 바로 고칠 수 있습니다
          </p>
        </div>
      ) : (
        <>
          <div className={styles.body}>
            <div className={styles.blocks}>
              <CareerDocumentEditor recordId={record.id} mode="peek" record={record} category={category} />
            </div>
          </div>

          <div className={styles.foot}>
            <div className={styles.quickActions}>
              {quickActions.map((action, index) => (
                <button
                  key={action}
                  type="button"
                  className={`${styles.quickAction} ${
                    index === 0 ? styles.quickActionSignature : ""
                  }`}
                >
                  {action}
                </button>
              ))}
            </div>
            <div className={styles.composer}>
              <Icon name="coffee" weight="fill" size={14} color="var(--ex-accent-text)" />
              <input
                className={styles.composerInput}
                placeholder="이 문서에 대해 바리스타에게 요청하기"
                aria-label="바리스타에게 요청"
              />
              <button type="button" className={styles.composerSend} aria-label="보내기">
                <Icon name="arrow-up" weight="fill" size={12} color="var(--ex-fg-on-accent)" />
              </button>
            </div>
          </div>
        </>
      )}
    </aside>
  );
}
