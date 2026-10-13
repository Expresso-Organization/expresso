"use client";
import { AgentChat } from "@/features/agent-chat/AgentChat";

import { EditorContent, useEditor } from "@tiptap/react";
import { CareerCategoriesResponseSchema, CareerRecordResponseSchema, type CareerCategory, type CareerPropertyDefinitionV2, type CareerRecordListItem } from "@expresso/contracts";
import { useEffect, useRef, useState } from "react";

import { useCareerEditorSession, type CareerEditorSnapshot } from "../session/useCareerEditorSession";
import { BlockHandle } from "./BlockHandle";
import styles from "./CareerDocumentEditor.module.css";
import {
  careerDocumentToTiptap,
  careerEditorExtensions,
  tiptapToCareerDocument,
} from "./extensions";
import { SelectionToolbar } from "./SelectionToolbar";
import { SlashMenu } from "./SlashMenu";
import { ensureCareerPropertyOption,withCareerPropertyOption } from "../properties/option-registration";
import { PropertyList } from "../properties/PropertyList";
import { readPropertyMutationJson, resumeCareerPropertyMutation, waitForCareerPropertyMutation } from "../properties/property-mutation-client";
import { AiProposalPanel, type AiPromptRequest } from "../ai/AiProposalPanel";

export function CareerDocumentEditor({
  recordId,
  mode,
  record,
  category,
  showAiProposal = true,
  onAiRequest,
  onSaveStatusChange,
  onResumePropertyMutation,
}: {
  recordId: string;
  mode: "peek" | "page";
  record?: CareerRecordListItem;
  category?: CareerCategory;
  showAiProposal?: boolean;
  onResumePropertyMutation?(jobId: string): Promise<void>;
  onAiRequest?: ((request: AiPromptRequest) => void) | undefined;
  onSaveStatusChange?: ((status: CareerEditorSnapshot["status"]) => void) | undefined;
}) {
  const { snapshot, document, updateDocument } = useCareerEditorSession(recordId);
  useEffect(() => { onSaveStatusChange?.(snapshot.status); }, [recordId, snapshot.status, onSaveStatusChange]);
  const [localRecord, setLocalRecord] = useState(record);
  const currentRecordId = useRef(recordId);
  const mutationPoll = useRef<AbortController | null>(null);
  useEffect(() => () => { mutationPoll.current?.abort(); }, [recordId]);
  currentRecordId.current = recordId;
  useEffect(() => setLocalRecord((previous) => !record || previous?.id !== record.id || record.version >= previous.version ? record : previous), [record]);
  const [localCategory,setLocalCategory] = useState(category);
  useEffect(() => setLocalCategory(category),[category]);
  const [slashOpen, setSlashOpen] = useState(false);
  const [aiRequest, setAiRequest] = useState<AiPromptRequest | null>(null);
  const applyingRemote = useRef(false);
  const loadedDocument = useRef<{ recordId: string; json: string } | null>(null);
  const editor = useEditor({
    immediatelyRender: false,
    extensions: careerEditorExtensions,
    ...(document ? { content: careerDocumentToTiptap(document) } : {}),
    shouldRerenderOnTransaction: true,
    editorProps: {
      attributes: {
        "aria-label": "커리어 기록 본문",
        spellcheck: "true",
      },
      handleKeyDown(view, event) {
        if (event.key === "/" && view.state.selection.$from.parent.textContent.length === 0) {
          setSlashOpen(true);
          return true;
        }
        if (event.key === "Escape") setSlashOpen(false);
        return false;
      },
      transformPastedHTML(html) {
        return html.replace(/<(script|style|iframe)[^>]*>[\s\S]*?<\/\1>/gi, "");
      },
    },
    onUpdate({ editor: current }) {
      if (applyingRemote.current) return;
      const next = tiptapToCareerDocument(current.getJSON());
      loadedDocument.current = { recordId, json: JSON.stringify(next) };
      updateDocument(next);
    },
  });

  useEffect(() => {
    if (!editor || !document) return;
    const json = JSON.stringify(document);
    if (loadedDocument.current?.recordId === recordId && loadedDocument.current.json === json) return;
    applyingRemote.current = true;
    editor.commands.setContent(careerDocumentToTiptap(document), { emitUpdate: false });
    loadedDocument.current = { recordId, json };
    applyingRemote.current = false;
  }, [document, editor, recordId]);

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
  if (!editor || !document) return <div className={styles.loading}>문서를 불러오고 있습니다.</div>;

  return (
    <section className={styles.editor} data-mode={mode} aria-label="커리어 문서 편집기">
      {localRecord && localCategory ? <PropertyList record={localRecord} definitions={categoryDefinitions(localCategory)} categoryId={localCategory.id} schemaMutable={!localCategory.isSystem} onResumePropertyMutation={jobId => observePropertyMutation(jobId, true)} onCheckPropertyMutation={observePropertyMutation} onEnsureOption={async (definition,label) => {
        const option=await ensureCareerPropertyOption(localCategory.id,definition.id,label);
        setLocalCategory(previous=>previous?withCareerPropertyOption(previous,definition.id,option):previous);
        return option;
      }} /> : null}
      <div className={styles.toolbarRow}>
        <SelectionToolbar editor={editor} onAiRequest={(prompt, blockIds) => { const request = { id: crypto.randomUUID(), recordId, prompt, blockIds }; if (onAiRequest) onAiRequest(request); else setAiRequest(request); }} />
        <BlockHandle editor={editor} />
      </div>
      <div className={styles.content}>
        <EditorContent editor={editor} />
        <SlashMenu editor={editor} open={slashOpen} onClose={() => setSlashOpen(false)} />
      </div>
      <AgentChat context={{ kind: "record", id: recordId }} contextLabel="현재 기록" />
      {showAiProposal ? <details open={aiRequest != null}><summary>선택 영역 빠른 편집</summary><AiProposalPanel onApplied={refreshBusinessRecord} recordId={recordId} documentVersion={snapshot.documentVersion} selectedBlockIds={selectedBlockIds(editor, document.content[0]?.id)} announcedProposal={snapshot.proposal} requestedPrompt={aiRequest} onRequestHandled={() => setAiRequest(null)} document={document} definitions={localCategory ? categoryDefinitions(localCategory) : []} /></details> : null}
    </section>
  );
}

function selectedBlockIds(editor: NonNullable<ReturnType<typeof useEditor>>, fallback?: string): string[] {
  const ids = new Set<string>();
  const { from, to } = editor.state.selection;
  editor.state.doc.nodesBetween(from, to, (node) => { if (typeof node.attrs.careerId === "string") ids.add(node.attrs.careerId); });
  return ids.size ? [...ids] : fallback ? [fallback] : [];
}

function categoryDefinitions(category: CareerCategory): CareerPropertyDefinitionV2[] {
  if (category.propertySchemaV2) return category.propertySchemaV2;
  return Object.entries(category.propertySchema).map(([key, definition], order) => ({
    id: definition.id ?? `00000000-0000-4000-8000-${String(order + 1).padStart(12, "0")}`,
    key, name: definition.label,
    type: definition.type === "boolean" ? "checkbox" : definition.type === "tags" ? "multi_select" : definition.type,
    required: definition.required, system: definition.system, config: {}, order, version: 1, deletedAt: null,
  }));
}
