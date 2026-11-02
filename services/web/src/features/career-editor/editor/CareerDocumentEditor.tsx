"use client";
import { AgentChat } from "@/features/agent-chat/AgentChat";

import dynamic from "next/dynamic";
import { CareerCategoriesResponseSchema, CareerRecordResponseSchema, type CareerCategory, type CareerRecordListItem } from "@expresso/contracts";
import { useCallback, useEffect, useRef, useState } from "react";

import { useCareerEditorSession, type CareerEditorSnapshot } from "../session/useCareerEditorSession";
import styles from "./CareerDocumentEditor.module.css";
import { SaveState } from "./SaveState";
import { RevisionHistory } from "../history/RevisionHistory";
import { ensureCareerPropertyOption, withCareerPropertyOption } from "../properties/option-registration";
import { readPropertyMutationJson, resumeCareerPropertyMutation, waitForCareerPropertyMutation } from "../properties/property-mutation-client";
import { PropertyList } from "../properties/PropertyList";
import { AiProposalPanel, type AiPromptRequest } from "../ai/AiProposalPanel";

type CareerDocumentEditorProps = {
  recordId: string;
  mode: "peek" | "page";
  record?: CareerRecordListItem;
  category?: CareerCategory;
  showAiProposal?: boolean;
  onResumePropertyMutation?(jobId: string): Promise<void>;
  onSaveStatusChange?: ((status: CareerEditorSnapshot["status"]) => void) | undefined;
  onAiRequest?: ((request: AiPromptRequest) => void) | undefined;
};

// BlockNote는 브라우저 DOM이 있어야 그려지므로 서버 렌더에서 뺍니다.
const BlockNoteBody = dynamic(() => import("./BlockNoteBody"), { ssr: false });

export function CareerDocumentEditor(props: CareerDocumentEditorProps) {
  const session = useCareerEditorSession(props.recordId);
  useEffect(() => { props.onSaveStatusChange?.(session.snapshot.status); }, [props.recordId, session.snapshot.status, props.onSaveStatusChange]);
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
  onResumePropertyMutation,
  session,
  yDocument,
}: CareerDocumentEditorProps & { session: ReturnType<typeof useCareerEditorSession>; yDocument: NonNullable<ReturnType<typeof useCareerEditorSession>["yDocument"]> }) {
  const { document, publishDocument } = session;
  const [localRecord, setLocalRecord] = useState(record);
  const currentRecordId = useRef(recordId);
  const mutationPoll = useRef<AbortController | null>(null);
  useEffect(() => () => { mutationPoll.current?.abort(); }, [recordId]);
  currentRecordId.current = recordId;
  useEffect(() => setLocalRecord((previous) => !record || previous?.id !== record.id || record.version >= previous.version ? record : previous), [record]);
  const [localCategory,setLocalCategory] = useState(category);
  useEffect(() => setLocalCategory(category),[category]);
  const [selection, setSelection] = useState<string[]>([]);
  const [aiRequest, setAiRequest] = useState<AiPromptRequest | null>(null);
  // 요청이 처리된 뒤에도 제안을 검토할 수 있게 패널은 사용자가 접을 때까지 열어 둡니다.
  const [panelOpen, setPanelOpen] = useState(false);
  const requestAi = useCallback((prompt: string, blockIds: string[]) => {
    const request = { id: crypto.randomUUID(), recordId, prompt, blockIds };
    if (onAiRequest) onAiRequest(request); else { setAiRequest(request); setPanelOpen(true); }
  }, [onAiRequest, recordId]);
  async function refreshBusinessRecord(signal?: AbortSignal) {
    async function read(url: string, issue: string) {
      if (signal) return readPropertyMutationJson(url, signal, issue);
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error(issue);
      return response.json() as Promise<unknown>;
    }
    const fresh = CareerRecordResponseSchema.parse(await read("/api/career/records/" + recordId, "최신 기록을 불러오지 못했습니다.")).data;
    if (fresh.id !== recordId) throw new Error("기록 응답이 요청과 일치하지 않습니다.");
    const freshCategory = CareerCategoriesResponseSchema.parse(await read("/api/career/categories", "최신 카테고리를 불러오지 못했습니다.")).data.find((item) => item.id === fresh.categoryId);
    if (!freshCategory) throw new Error("카테고리를 찾을 수 없습니다.");
    signal?.throwIfAborted();
    if (currentRecordId.current !== recordId) return;
    setLocalRecord((previous) => previous?.id === fresh.id && previous.version <= fresh.version ? { ...previous, ...fresh, pendingPropertyMutation: fresh.pendingPropertyMutation, pendingRelationPropertyIds: fresh.pendingRelationPropertyIds } : previous);
    setLocalCategory(previous => !previous || previous.version <= freshCategory.version ? freshCategory : previous);
  }
  async function observePropertyMutation(jobId: string, resume = false) {
    if (!localCategory) return;
    const controller = new AbortController();
    mutationPoll.current?.abort();
    mutationPoll.current = controller;
    try {
      if (resume) {
        if (onResumePropertyMutation) await onResumePropertyMutation(jobId); else await resumeCareerPropertyMutation(jobId, controller.signal);
      }
      if (controller.signal.aborted || currentRecordId.current !== recordId) return;
      const result = await waitForCareerPropertyMutation(jobId, localCategory.id, { signal: controller.signal, onStatus: status => {
        if (status.status === "completed" || controller.signal.aborted || currentRecordId.current !== recordId) return;
        setLocalRecord(previous => previous?.id === recordId && previous.pendingPropertyMutation?.jobId === jobId ? { ...previous, pendingPropertyMutation: { ...previous.pendingPropertyMutation, status: status.status as "pending" | "running" | "failed", retryable: status.retryable } } : previous);
      } });
      await refreshBusinessRecord(controller.signal);
      if (result.status === "failed") throw new Error("속성 변경이 다시 중단되었습니다. 작업 상태를 확인해 주세요.");
    } catch (error) {
      if (!controller.signal.aborted && currentRecordId.current === recordId) throw error;
    } finally {
      controller.abort();
      if (mutationPoll.current === controller) mutationPoll.current = null;
    }
  }
  const firstBlockId = document?.content[0]?.id;
  return (
    <section className={styles.editor} data-mode={mode} aria-label="커리어 문서 편집기">
      <div className={styles.topRow}>{mode === "page" ? <SaveState recordId={recordId} /> : null}<RevisionHistory recordId={recordId} /></div>
      {localRecord && localCategory ? <PropertyList record={localRecord} definitions={localCategory.propertySchemaV2} categoryId={localCategory.id} onResumePropertyMutation={jobId => observePropertyMutation(jobId, true)} onCheckPropertyMutation={observePropertyMutation} onEnsureOption={async (definition, label) => {
        const option = await ensureCareerPropertyOption(localCategory.id, definition.id, label);
        setLocalCategory(previous => previous ? withCareerPropertyOption(previous, definition.id, option) : previous);
        return option;
      }} /> : null}
      <div className={styles.content}>
        <BlockNoteBody yDocument={yDocument} userName="나" onAiRequest={showAiProposal || onAiRequest ? requestAi : undefined} onDocumentChange={publishDocument} onSelectionChange={setSelection} />
      </div>
      <AgentChat context={{ kind: "record", id: recordId }} contextLabel="현재 기록" />
      {showAiProposal && document ? <details open={panelOpen} onToggle={(event) => setPanelOpen(event.currentTarget.open)}><summary>선택 영역 빠른 편집</summary><AiProposalPanel onApplied={refreshBusinessRecord} recordId={recordId} documentVersion={session.snapshot.documentVersion} selectedBlockIds={selection.length ? selection : firstBlockId ? [firstBlockId] : []} announcedProposal={session.snapshot.proposal} requestedPrompt={aiRequest} onRequestHandled={() => setAiRequest(null)} document={document} definitions={localCategory?.propertySchemaV2 ?? []} /></details> : null}
    </section>
  );
}
