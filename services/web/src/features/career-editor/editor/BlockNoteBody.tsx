"use client";

import "@blocknote/core/style.css";
import "@blocknote/ariakit/style.css";

import { BlockNoteView } from "@blocknote/ariakit";
import { ko } from "@blocknote/core/locales";
import { useCreateBlockNote } from "@blocknote/react";
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
    schema: careerBlockNoteSchema,
    dictionary: ko,
    uploadFile,
    resolveFileUrl,
    collaboration: {
      fragment: yDocument.getXmlFragment(BLOCKNOTE_FRAGMENT),
      user: { name: userName, color: "var(--ex-accent)" },
    },
  } as never, [yDocument]);
  return (
    <div className={styles.body}>
      <BlockNoteView editor={editor} />
    </div>
  );
}
