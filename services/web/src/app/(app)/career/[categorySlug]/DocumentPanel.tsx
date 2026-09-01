"use client";

import type { CareerCategory, CareerRecordListItem } from "@expresso/contracts";

import { Icon } from "@/components/ui/Icon";
import { CareerDocumentEditor } from "@/features/career-editor/editor/CareerDocumentEditor";
import { AiProposalPanel } from "@/features/career-editor/ai/AiProposalPanel";
import { useCareerEditorSession } from "@/features/career-editor/session/useCareerEditorSession";

import styles from "./DocumentPanel.module.css";

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
              <CareerDocumentEditor recordId={record.id} mode="peek" record={record} category={category} showAiProposal={false} />
            </div>
          </div>

          <div className={styles.foot}>
            <DocumentPanelAiDock recordId={record.id} />
          </div>
        </>
      )}
    </aside>
  );
}

function DocumentPanelAiDock({ recordId }: { recordId: string }) {
  const { snapshot, document } = useCareerEditorSession(recordId);
  return <AiProposalPanel recordId={recordId} documentVersion={snapshot.documentVersion} selectedBlockIds={document?.content[0]?.id ? [document.content[0].id] : []} announcedProposal={snapshot.proposal} />;
}
