"use client";
import { AgentChat } from "@/features/agent-chat/AgentChat";

import { EditorContent, useEditor } from "@tiptap/react";
import type { CareerCategory, CareerPropertyDefinitionV2, CareerRecordListItem } from "@expresso/contracts";
import { markdownToCareerDocument } from "@expresso/editor";
import { useEffect, useRef, useState } from "react";

import { useCareerEditorSession } from "../session/useCareerEditorSession";
import { BlockHandle } from "./BlockHandle";
import styles from "./CareerDocumentEditor.module.css";
import {
  careerDocumentToTiptap,
  careerEditorExtensions,
  tiptapToCareerDocument,
} from "./extensions";
import { SelectionToolbar } from "./SelectionToolbar";
import { SlashMenu } from "./SlashMenu";
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

export function CareerDocumentEditor(props: CareerDocumentEditorProps) {
  const session = useCareerEditorSession(props.recordId);
  // 문서 세션이 없는 기록은 편집기 대신 기존 본문을 읽기 전용으로 보여 줍니다.
  if (session.snapshot.status === "unavailable") return <CareerDocumentReadOnly mode={props.mode} {...(props.record ? { record: props.record } : {})} {...(props.category ? { category: props.category } : {})} />;
  return <CareerDocumentEditorBody {...props} session={session} />;
}

function CareerDocumentEditorBody({
  recordId,
  mode,
  record,
  category,
  showAiProposal = true,
  onAiRequest,
  session,
}: CareerDocumentEditorProps & { session: ReturnType<typeof useCareerEditorSession> }) {
  const { snapshot, document, updateDocument } = session;
  const [slashOpen, setSlashOpen] = useState(false);
  const [aiRequest, setAiRequest] = useState<AiPromptRequest | null>(null);
  const applyingRemote = useRef(false);
  const loadedVersion = useRef(-1);
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
      updateDocument(tiptapToCareerDocument(current.getJSON()));
    },
  });

  useEffect(() => {
    if (!editor || !document || snapshot.documentVersion === loadedVersion.current) return;
    applyingRemote.current = true;
    editor.commands.setContent(careerDocumentToTiptap(document), { emitUpdate: false });
    loadedVersion.current = snapshot.documentVersion;
    applyingRemote.current = false;
  }, [document, editor, snapshot.documentVersion]);

  if (!editor || !document) return <div className={styles.loading}>문서를 불러오고 있습니다.</div>;

  return (
    <section className={styles.editor} data-mode={mode} aria-label="커리어 문서 편집기">
      {record && category ? <PropertyList record={record} definitions={categoryDefinitions(category)} categoryId={category.id} schemaMutable={!category.isSystem} /> : null}
      <div className={styles.toolbarRow}>
        <SelectionToolbar editor={editor} onAiRequest={(prompt, blockIds) => { const request = { id: crypto.randomUUID(), recordId, prompt, blockIds }; if (onAiRequest) onAiRequest(request); else setAiRequest(request); }} />
        <BlockHandle editor={editor} />
      </div>
      <div className={styles.content}>
        <EditorContent editor={editor} />
        <SlashMenu editor={editor} open={slashOpen} onClose={() => setSlashOpen(false)} />
      </div>
      <AgentChat context={{ kind: "record", id: recordId }} contextLabel="현재 기록" />
      {showAiProposal ? <details open={aiRequest != null}><summary>선택 영역 빠른 편집</summary><AiProposalPanel recordId={recordId} documentVersion={snapshot.documentVersion} selectedBlockIds={selectedBlockIds(editor, document.content[0]?.id)} announcedProposal={snapshot.proposal} requestedPrompt={aiRequest} onRequestHandled={() => setAiRequest(null)} document={document} definitions={category ? categoryDefinitions(category) : []} /></details> : null}
    </section>
  );
}

/** v2 문서 세션 없이 기록의 속성과 기존 Markdown 본문을 보여 줍니다. 본문은 고칠 수 없고 속성은 기존 기록 API로 저장됩니다. */
export function CareerDocumentReadOnly({ mode, record, category }: { mode: "peek" | "page"; record?: CareerRecordListItem; category?: CareerCategory }) {
  const bodyMd = record?.bodyMd ?? "";
  const editor = useEditor({
    immediatelyRender: false,
    editable: false,
    extensions: careerEditorExtensions,
    content: careerDocumentToTiptap(markdownToCareerDocument(bodyMd)),
    editorProps: { attributes: { "aria-label": "커리어 기록 본문" } },
  }, [bodyMd]);
  return (
    <section className={styles.editor} data-mode={mode} aria-label="커리어 문서">
      {record && category ? <PropertyList record={record} definitions={categoryDefinitions(category)} categoryId={category.id} schemaMutable={!category.isSystem} /> : null}
      <div className={styles.content}>
        <p className={styles.notice}>문서 편집기가 꺼져 있어 본문을 읽기만 할 수 있습니다.</p>
        {bodyMd.trim() && editor ? <EditorContent editor={editor} /> : null}
      </div>
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
