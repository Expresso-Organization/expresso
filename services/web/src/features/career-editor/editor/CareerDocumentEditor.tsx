"use client";
import { AgentChat } from "@/features/agent-chat/AgentChat";

import { EditorContent, useEditor } from "@tiptap/react";
import type { CareerCategory, CareerPropertyDefinitionV2, CareerRecordListItem } from "@expresso/contracts";
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
  // 문서 bootstrap의 404는 서버가 이 계정에서 기록을 찾지 못했다는 뜻입니다.
  if (session.snapshot.status === "unavailable") return <section className={styles.editor} data-mode={props.mode} aria-label="커리어 문서"><div className={styles.content}><p className={styles.notice}>이 기록을 찾을 수 없습니다. 삭제되었거나 다른 계정의 기록입니다.</p></div></section>;
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
      {record && category ? <PropertyList record={record} definitions={category.propertySchemaV2} categoryId={category.id} /> : null}
      <div className={styles.toolbarRow}>
        <SelectionToolbar editor={editor} onAiRequest={(prompt, blockIds) => { const request = { id: crypto.randomUUID(), recordId, prompt, blockIds }; if (onAiRequest) onAiRequest(request); else setAiRequest(request); }} />
        <BlockHandle editor={editor} />
      </div>
      <div className={styles.content}>
        <EditorContent editor={editor} />
        <SlashMenu editor={editor} open={slashOpen} onClose={() => setSlashOpen(false)} />
      </div>
      <AgentChat context={{ kind: "record", id: recordId }} contextLabel="현재 기록" />
      {showAiProposal ? <details open={aiRequest != null}><summary>선택 영역 빠른 편집</summary><AiProposalPanel recordId={recordId} documentVersion={snapshot.documentVersion} selectedBlockIds={selectedBlockIds(editor, document.content[0]?.id)} announcedProposal={snapshot.proposal} requestedPrompt={aiRequest} onRequestHandled={() => setAiRequest(null)} document={document} definitions={category?.propertySchemaV2 ?? []} /></details> : null}
    </section>
  );
}

function selectedBlockIds(editor: NonNullable<ReturnType<typeof useEditor>>, fallback?: string): string[] {
  const ids = new Set<string>();
  const { from, to } = editor.state.selection;
  editor.state.doc.nodesBetween(from, to, (node) => { if (typeof node.attrs.careerId === "string") ids.add(node.attrs.careerId); });
  return ids.size ? [...ids] : fallback ? [fallback] : [];
}
