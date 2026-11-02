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
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type * as Y from "yjs";

import { Icon } from "@/components/ui/Icon";
import { API_BASE_URL } from "@/lib/api/client";

import { AI_ACTIONS } from "../ai/ai-actions";
import styles from "./BlockNoteBody.module.css";
import { uploadCareerMediaAction } from "./media-actions";

/** 본문 글자 상한입니다. Markdown 기호를 더해도 bodyMd 계약 상한 20만 자 안에 들게 둡니다. */
const BODY_TEXT_LIMIT = 150_000;

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

/**
 * 선택 영역 AI 편집 메뉴입니다. BlockNote 서식 툴바는 가로로 넘치면 스크롤하도록 `overflow`를 두므로,
 * 툴바 안에 메뉴를 두면 툴바 아래로 잘려 보이지 않습니다. 메뉴는 body에 붙이고 단추 위치로 놓습니다.
 */
function AiMenu({ editor, onAiRequest }: { editor: BlockNoteEditor; onAiRequest(prompt: string, blockIds: string[]): void }) {
  const Components = useComponentsContext();
  const anchorRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; right: number } | null>(null);
  useEffect(() => {
    if (!position) return;
    const close = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !anchorRef.current?.contains(target)) setPosition(null);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setPosition(null); };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", escape); };
  }, [position]);
  if (!Components) return null;
  const toggle = () => {
    if (position) { setPosition(null); return; }
    const rect = anchorRef.current?.getBoundingClientRect();
    if (rect) setPosition({ top: rect.bottom + 4, right: Math.max(8, window.innerWidth - rect.right) });
  };
  return (
    <div ref={anchorRef} className={styles.aiMenu}>
      <Components.FormattingToolbar.Button label="AI 편집" mainTooltip="선택 영역 AI 편집" icon={<Icon name="sparkle" size={14} />} isSelected={position !== null} onClick={toggle}>
        <span className={styles.aiLabel}>AI 편집</span>
      </Components.FormattingToolbar.Button>
      {position ? createPortal(
        <div ref={menuRef} className={styles.aiActions} role="menu" aria-label="선택 영역 AI 편집" style={{ top: position.top, right: position.right }}>
          {AI_ACTIONS.map((item) => (
            <button key={item.label} type="button" role="menuitem" onMouseDown={(event) => event.preventDefault()} onClick={() => { onAiRequest(item.prompt, selectedBlockIds(editor)); setPosition(null); }}>
              <Icon name={item.icon} size={13} />{item.label}
            </button>
          ))}
        </div>,
        document.body,
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
  const [limitNotice, setLimitNotice] = useState(false);
  const editor = useCreateBlockNote({
    // 본문은 bodyMd(20만 자)로 투영되어 매칭 · 생성에 쓰입니다. 붙여 넣은 뒤 본문이 상한을 넘으면 붙여 넣지 않고 이유를 보입니다.
    pasteHandler: ({ event, editor: target, defaultPasteHandler }) => {
      const pasted = event.clipboardData?.getData("text/plain") ?? "";
      if (target.prosemirrorState.doc.textContent.length + pasted.length > BODY_TEXT_LIMIT) { setLimitNotice(true); return true; }
      setLimitNotice(false);
      return defaultPasteHandler();
    },
    // 공용 스키마는 exactOptionalPropertyTypes 때문에 넓은 타입으로 만들어졌습니다. 이 한 곳만 좁힙니다.
    schema: careerBlockNoteSchema as never,
    dictionary: ko,
    uploadFile,
    resolveFileUrl,
    // v1 표의 머리글 행을 그대로 열고 새 표에서도 머리글을 켤 수 있게 합니다.
    tables: { headers: true },
    // 편집 영역에 이름을 붙여 보조 기술과 E2E가 본문을 찾게 합니다.
    domAttributes: { editor: { "aria-label": "커리어 기록 본문" } },
    // 0.56은 협업을 확장으로 켭니다. 전송은 CareerEditorSession이 Y.Doc 업데이트를 받아 맡습니다.
    extensions: [CollaborationExtension({
      fragment: yDocument.getXmlFragment(BLOCKNOTE_FRAGMENT),
      user: { name: userName, color: "var(--ex-accent)" },
    })],
  }, [yDocument]);
  const blockEditor = editor as unknown as BlockNoteEditor;
  // 처음 열 때도 사본을 한 번 올립니다. 이후에는 원격 업데이트를 포함한 모든 변경 때 올립니다.
  useEffect(() => { onDocumentChange?.(blockNoteToCareerDocument(editor.document)); }, [editor, onDocumentChange]);
  // 콜아웃을 인용과 같은 묶음 끝에 넣습니다. 묶음이 이어지지 않으면 메뉴에 묶음 머리가 두 번 나옵니다.
  const slashItems = async (query: string) => {
    const items = getDefaultReactSlashMenuItems(editor);
    const group = ko.slash_menu.quote.group;
    const callout = {
      title: "콜아웃",
      subtext: "아이콘과 함께 강조할 문장",
      aliases: ["callout", "강조"],
      ...(group ? { group } : {}),
      onItemClick: () => { insertOrUpdateBlockForSlashMenu(editor, { type: "callout" } as never); },
    };
    const last = group ? items.findLastIndex((item) => item.group === group) : items.length - 1;
    return filterSuggestionItems([...items.slice(0, last + 1), callout, ...items.slice(last + 1)], query);
  };
  return (
    <div className={styles.body}>
      {limitNotice ? <p className={styles.limitNotice} role="alert">본문은 {BODY_TEXT_LIMIT.toLocaleString("ko-KR")}자까지 쓸 수 있습니다. 붙여 넣은 글이 길어 넣지 않았습니다.</p> : null}
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
