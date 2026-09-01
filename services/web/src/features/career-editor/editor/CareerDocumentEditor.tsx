"use client";

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

const statusLabel = {
  loading: "불러오는 중",
  saving: "저장 중",
  saved: "저장됨",
  offline: "오프라인",
  conflict: "충돌 확인 필요",
} as const;

export function CareerDocumentEditor({
  recordId,
  mode,
  record,
  category,
}: {
  recordId: string;
  mode: "peek" | "page";
  record?: CareerRecordListItem;
  category?: CareerCategory;
}) {
  const { snapshot, document, updateDocument } = useCareerEditorSession(recordId);
  const [slashOpen, setSlashOpen] = useState(false);
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
      {record && category ? <PropertyList record={record} definitions={categoryDefinitions(category)} categoryId={category.id} categoryVersion={category.version} schemaMutable={!category.isSystem} /> : null}
      <div className={styles.statusBar}>
        <span>본문 편집</span>
        <span className={styles.saveState} data-status={snapshot.status} role="status" aria-live="polite">
          {statusLabel[snapshot.status]}
        </span>
      </div>
      <div className={styles.toolbarRow}>
        <SelectionToolbar editor={editor} />
        <BlockHandle editor={editor} />
      </div>
      <div className={styles.content}>
        <EditorContent editor={editor} />
        <SlashMenu editor={editor} open={slashOpen} onClose={() => setSlashOpen(false)} />
      </div>
    </section>
  );
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
