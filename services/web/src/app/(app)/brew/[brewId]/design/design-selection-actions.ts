"use server";

import {
  SaveDesignSelectionSchema,
  type DesignSystemSpecV2,
  type ReferenceLock,
} from "@expresso/contracts";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ApiError } from "@/lib/api/client";
import { designSystems } from "@/lib/api/endpoints";
import { requireSession } from "@/lib/require-session";

export type DesignSelectionActionState = {
  error: string | null;
  savedRevisionId: string | null;
};

export async function saveDesignSelectionAction(
  previous: DesignSelectionActionState,
  formData: FormData,
): Promise<DesignSelectionActionState> {
  const session = await requireSession();
  const brewId = z.uuid().safeParse(String(formData.get("brewId") ?? ""));
  const input = SaveDesignSelectionSchema.safeParse({
    revisionId: String(formData.get("designSystemRevisionId") ?? ""),
  });

  if (!brewId.success || !input.success) {
    return { ...previous, error: "디자인 선택을 확인하지 못했습니다. 다시 골라 주세요." };
  }

  try {
    const saved = await designSystems.select(
      session.accessToken,
      brewId.data,
      input.data,
    );
    revalidatePath(`/brew/${brewId.data}/design`);
    return {
      error: null,
      savedRevisionId: saved.data.designSystemRevisionId,
    };
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 404) {
        return { ...previous, error: "선택한 디자인을 찾지 못했습니다. 목록을 다시 열어 주세요." };
      }
      if (error.status === 409) {
        return { ...previous, error: "다른 창에서 선택이 바뀌었습니다. 화면을 새로 열어 주세요." };
      }
      return { ...previous, error: "디자인을 저장하지 못했습니다. 잠시 뒤 다시 시도해 주세요." };
    }
    throw error;
  }
}

export type DesignDocument = {
  designHtml: string;
  designMarkdown: string;
  markdownSha256: string;
  contentHash: string;
  spec: DesignSystemSpecV2;
  referenceLock: ReferenceLock | null;
};

/**
 * 문서는 고른 판 하나만 불러온다. 목록이 서른여덟 벌을 다 싣던 것을 걷어낸 자리다.
 */
export async function loadDesignDocumentAction(
  revisionId: string,
): Promise<DesignDocument | null> {
  const parsed = z.uuid().safeParse(revisionId);
  if (!parsed.success) return null;
  const session = await requireSession();
  try {
    const { data } = await designSystems.revision(session.accessToken, parsed.data);
    return {
      designHtml: data.designHtml,
      designMarkdown: data.designMarkdown,
      markdownSha256: data.markdownSha256,
      contentHash: data.contentHash,
      spec: data.spec,
      referenceLock: data.referenceLock,
    };
  } catch (error) {
    if (error instanceof ApiError) return null;
    throw error;
  }
}
