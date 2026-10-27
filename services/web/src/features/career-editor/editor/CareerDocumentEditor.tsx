"use client";
import { AgentChat } from "@/features/agent-chat/AgentChat";

import dynamic from "next/dynamic";
import type { CareerCategory, CareerRecordListItem } from "@expresso/contracts";
import { useCallback, useState } from "react";

import { useCareerEditorSession } from "../session/useCareerEditorSession";
import styles from "./CareerDocumentEditor.module.css";
import { SaveState } from "./SaveState";
import { PropertyList } from "../properties/PropertyList";
import { AiProposalPanel, type AiPromptRequest } from "../ai/AiProposalPanel";

type CareerDocumentEditorProps = {
  recordId: string;
  mode: "peek" | "page";
  record?: CareerRecordListItem;
  category?: CareerCategory;
  showAiProposal?: boolean;
  onAiRequest?: ((request: AiPromptRequest) => void) | undefined;
};

// BlockNote는 브라우저 DOM이 있어야 그려지므로 서버 렌더에서 뺍니다.
const BlockNoteBody = dynamic(() => import("./BlockNoteBody"), { ssr: false });

export function CareerDocumentEditor(props: CareerDocumentEditorProps) {
  const session = useCareerEditorSession(props.recordId);
  if (session.yDocument) return <BlockNoteDocumentEditor {...props} session={session} yDocument={session.yDocument} />;
  // 문서 bootstrap의 404는 서버가 이 계정에서 기록을 찾지 못했다는 뜻입니다.
  if (session.snapshot.status === "unavailable") return <section className={styles.editor} data-mode={props.mode} aria-label="커리어 문서"><div className={styles.content}><p className={styles.notice}>이 기록을 찾을 수 없습니다. 삭제되었거나 다른 계정의 기록입니다.</p></div></section>;
  return <div className={styles.loading}>문서를 불러오고 있습니다.</div>;
}

function BlockNoteDocumentEditor({
  recordId,
  mode,
  record,
  category,
  showAiProposal = true,
  onAiRequest,
  session,
  yDocument,
}: CareerDocumentEditorProps & { session: ReturnType<typeof useCareerEditorSession>; yDocument: NonNullable<ReturnType<typeof useCareerEditorSession>["yDocument"]> }) {
  const { document, publishDocument } = session;
  const [selection, setSelection] = useState<string[]>([]);
  const [aiRequest, setAiRequest] = useState<AiPromptRequest | null>(null);
  // 요청이 처리된 뒤에도 제안을 검토할 수 있게 패널은 사용자가 접을 때까지 열어 둡니다.
  const [panelOpen, setPanelOpen] = useState(false);
  const requestAi = useCallback((prompt: string, blockIds: string[]) => {
    const request = { id: crypto.randomUUID(), recordId, prompt, blockIds };
    if (onAiRequest) onAiRequest(request); else { setAiRequest(request); setPanelOpen(true); }
  }, [onAiRequest, recordId]);
  const firstBlockId = document?.content[0]?.id;
  return (
    <section className={styles.editor} data-mode={mode} aria-label="커리어 문서 편집기">
      {mode === "page" ? <div className={styles.pageState}><SaveState recordId={recordId} /></div> : null}
      {record && category ? <PropertyList record={record} definitions={category.propertySchemaV2} categoryId={category.id} /> : null}
      <div className={styles.content}>
        <BlockNoteBody yDocument={yDocument} userName="나" onAiRequest={showAiProposal || onAiRequest ? requestAi : undefined} onDocumentChange={publishDocument} onSelectionChange={setSelection} />
      </div>
      <AgentChat context={{ kind: "record", id: recordId }} contextLabel="현재 기록" />
      {showAiProposal && document ? <details open={panelOpen} onToggle={(event) => setPanelOpen(event.currentTarget.open)}><summary>선택 영역 빠른 편집</summary><AiProposalPanel recordId={recordId} documentVersion={session.snapshot.documentVersion} selectedBlockIds={selection.length ? selection : firstBlockId ? [firstBlockId] : []} announcedProposal={session.snapshot.proposal} requestedPrompt={aiRequest} onRequestHandled={() => setAiRequest(null)} document={document} definitions={category?.propertySchemaV2 ?? []} /></details> : null}
    </section>
  );
}
