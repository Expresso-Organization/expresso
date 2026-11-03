"use server";

import { media } from "@/lib/api/endpoints";
import { requireSession } from "@/lib/require-session";

/**
 * 커리어 본문에 놓은 파일을 미디어로 올린다.
 *
 * 본문에는 API 주소가 아니라 `/v1/media/{id}` 경로만 남긴다. 화면은 그릴 때
 * API 주소를 붙인다. 주소가 바뀌어도 저장된 본문을 고칠 필요가 없다.
 */
export async function uploadCareerMediaAction(formData: FormData): Promise<{ url?: string; error?: string }> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "파일을 골라 주세요." };
  const session = await requireSession();
  try {
    const asset = await media.upload(session.accessToken, file);
    return { url: `/v1/media/${asset.id}` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "파일을 올리지 못했습니다." };
  }
}
