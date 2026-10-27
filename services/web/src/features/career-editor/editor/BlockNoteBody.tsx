"use client";

import "@blocknote/core/style.css";
import "@blocknote/ariakit/style.css";

import { BlockNoteView } from "@blocknote/ariakit";
import { filterSuggestionItems, insertOrUpdateBlockForSlashMenu, type BlockNoteEditor } from "@blocknote/core";
import { ko } from "@blocknote/core/locales";
import { CollaborationExtension } from "@blocknote/core/yjs";
import {
  FormattingToolbar,
  FormattingToolbarController,
  getDefaultReactSlashMenuItems,
  getFormattingToolbarItems,
  SuggestionMenuController,
  useComponentsContext,
  useCreateBlockNote,
} from "@blocknote/react";
import { mediaAssetUrl } from "@expresso/contracts";
import type { CareerDocument } from "@expresso/editor/document";
import { BLOCKNOTE_FRAGMENT, blockNoteToCareerDocument, careerBlockNoteSchema } from "@expresso/editor/blocknote";
import { useEffect, useState } from "react";
import type * as Y from "yjs";

import { Icon } from "@/components/ui/Icon";
import { API_BASE_URL } from "@/lib/api/client";

import { AI_ACTIONS } from "../ai/ai-actions";
import styles from "./BlockNoteBody.module.css";
import { uploadCareerMediaAction } from "./media-actions";

async function uploadFile(file: File): Promise<string> {
  const form = new FormData();
  form.set("file", file);
  const result = await uploadCareerMediaAction(form);
  if (!result.url) throw new Error(result.error ?? "파일을 올리지 못했습니다.");
  return result.url;
}

// 본문에는 /v1/media/{id}만 저장하고 그릴 때 API 주소를 붙입니다.
async function resolveFileUrl(url: string): Promise<string> {
  const media = /^\/v1\/media\/([0-9a-f-]{36})$/i.exec(url);
  return media?.[1] ? mediaAssetUrl(API_BASE_URL, media[1]) : url;
}

/** 선택한 블록 ID입니다. 선택이 없으면 커서가 있는 블록입니다. */
function selectedBlockIds(editor: BlockNoteEditor): string[] {
  const selection = editor.getSelection();
  return selection ? selection.blocks.map((block) => block.id) : [editor.getTextCursorPosition().block.id];
}

function AiMenu({ editor, onAiRequest }: { editor: BlockNoteEditor; onAiRequest(prompt: string, blockIds: string[]): void }) {
  const Components = useComponentsContext();
  const [open, setOpen] = useState(false);
  if (!Components) return null;
  return (
    <div className={styles.aiMenu}>
      <Components.FormattingToolbar.Button label="AI 편집" mainTooltip="선택 영역 AI 편집" icon={<Icon name="sparkle" size={14} />} isSelected={open} onClick={() => setOpen((current) => !current)}>
        <span className={styles.aiLabel}>AI 편집</span>
      </Components.FormattingToolbar.Button>
      {open ? (
        <div className={styles.aiActions} role="menu" aria-label="선택 영역 AI 편집">
          {AI_ACTIONS.map((item) => (
            <button key={item.label} type="button" role="menuitem" onMouseDown={(event) => event.preventDefault()} onClick={() => { onAiRequest(item.prompt, selectedBlockIds(editor)); setOpen(false); }}>
              <Icon name={item.icon} size={13} />{item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export interface BlockNoteBodyProps {
  yDocument: Y.Doc;
  userName: string;
  /** 선택 영역 AI 편집 요청입니다. 없으면 툴바에 AI 메뉴를 두지 않습니다. */
  onAiRequest?: ((prompt: string, blockIds: string[]) => void) | undefined;
  /** 본문이 바뀔 때 v1 모양 사본을 올립니다. AI 제안 비교 화면이 읽습니다. */
  onDocumentChange?: ((document: CareerDocument) => void) | undefined;
  onSelectionChange?: ((blockIds: string[]) => void) | undefined;
}

export default function BlockNoteBody({ yDocument, userName, onAiRequest, onDocumentChange, onSelectionChange }: BlockNoteBodyProps) {
  const editor = useCreateBlockNote({
    // 공용 스키마는 exactOptionalPropertyTypes 때문에 넓은 타입으로 만들어졌습니다. 이 한 곳만 좁힙니다.
    schema: careerBlockNoteSchema as never,
    dictionary: ko,
    uploadFile,
    resolveFileUrl,
    // v1 표의 머리글 행을 그대로 열고 새 표에서도 머리글을 켤 수 있게 합니다.
    tables: { headers: true },
    // 0.56은 협업을 확장으로 켭니다. 전송은 CareerEditorSession이 Y.Doc 업데이트를 받아 맡습니다.
    extensions: [CollaborationExtension({
      fragment: yDocument.getXmlFragment(BLOCKNOTE_FRAGMENT),
      user: { name: userName, color: "var(--ex-accent)" },
    })],
  }, [yDocument]);
  const blockEditor = editor as unknown as BlockNoteEditor;
  // 처음 열 때도 사본을 한 번 올립니다. 이후에는 원격 업데이트를 포함한 모든 변경 때 올립니다.
  useEffect(() => { onDocumentChange?.(blockNoteToCareerDocument(editor.document)); }, [editor, onDocumentChange]);
  // 기본 메뉴에 커스텀 콜아웃 블록을 더합니다.
  const slashItems = async (query: string) => filterSuggestionItems([
    ...getDefaultReactSlashMenuItems(editor),
    {
      title: "콜아웃",
      subtext: "아이콘과 함께 강조할 문장",
      aliases: ["callout", "강조"],
      group: "기본 블록",
      onItemClick: () => { insertOrUpdateBlockForSlashMenu(editor, { type: "callout" } as never); },
    },
  ], query);
  return (
    <div className={styles.body}>
      <BlockNoteView
        editor={editor}
        slashMenu={false}
        formattingToolbar={false}
        onChange={() => onDocumentChange?.(blockNoteToCareerDocument(editor.document))}
        onSelectionChange={() => onSelectionChange?.(selectedBlockIds(blockEditor))}
      >
        <SuggestionMenuController triggerCharacter="/" getItems={slashItems} />
        <FormattingToolbarController formattingToolbar={() => (
          <FormattingToolbar>
            {...getFormattingToolbarItems()}
            {onAiRequest ? <AiMenu key="ai" editor={blockEditor} onAiRequest={onAiRequest} /> : null}
          </FormattingToolbar>
        )} />
      </BlockNoteView>
    </div>
  );
}
