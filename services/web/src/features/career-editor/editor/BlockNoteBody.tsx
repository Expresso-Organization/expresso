"use client";

import "@blocknote/core/style.css";
import "@blocknote/ariakit/style.css";

import { BlockNoteView } from "@blocknote/ariakit";
import { ko } from "@blocknote/core/locales";
import { CollaborationExtension } from "@blocknote/core/yjs";
import { filterSuggestionItems, insertOrUpdateBlockForSlashMenu } from "@blocknote/core";
import { getDefaultReactSlashMenuItems, SuggestionMenuController, useCreateBlockNote } from "@blocknote/react";
import { mediaAssetUrl } from "@expresso/contracts";
import { BLOCKNOTE_FRAGMENT, careerBlockNoteSchema } from "@expresso/editor/blocknote";
import type * as Y from "yjs";

import { API_BASE_URL } from "@/lib/api/client";

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

export default function BlockNoteBody({ yDocument, userName }: { yDocument: Y.Doc; userName: string }) {
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
      <BlockNoteView editor={editor} slashMenu={false}>
        <SuggestionMenuController triggerCharacter="/" getItems={slashItems} />
      </BlockNoteView>
    </div>
  );
}
