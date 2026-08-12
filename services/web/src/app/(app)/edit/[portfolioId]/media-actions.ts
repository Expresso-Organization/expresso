"use server";

import { MediaFrameSchema } from "@expresso/contracts";
import { revalidatePath } from "next/cache";

import { ApiError } from "@/lib/api/client";
import { media } from "@/lib/api/endpoints";
import { requireSession } from "@/lib/require-session";

/**
 * 04에서 이미지를 놓는다.
 *
 * 두 걸음이다 — 자산을 올리고, 그 자산을 지면의 한 자리에 놓는다. 나눠 둔 이유는
 * 같은 그림을 여러 포트폴리오가 쓸 수 있어서다. 화면에서는 한 번의 동작으로 보인다.
 */
export interface MediaResult {
  blockId?: string;
  error?: string;
}

export async function addMediaAction(formData: FormData): Promise<MediaResult> {
  const portfolioId = formData.get("portfolioId");
  const sectionId = formData.get("sectionId");
  const file = formData.get("file");
  if (typeof portfolioId !== "string" || typeof sectionId !== "string") {
    return { error: "어느 섹션에 놓을지 알 수 없습니다." };
  }
  if (!(file instanceof File) || file.size === 0) return { error: "이미지를 골라 주세요." };

  const frame = MediaFrameSchema.safeParse(formData.get("frame"));
  const alt = typeof formData.get("alt") === "string" ? String(formData.get("alt")) : "";
  const session = await requireSession();

  try {
    const asset = await media.upload(session.accessToken, file);
    const { data } = await media.addBlock(session.accessToken, portfolioId, sectionId, {
      assetId: asset.id,
      alt,
      frame: frame.success ? frame.data : "none",
    });
    revalidatePath(`/edit/${portfolioId}`);
    return { blockId: data.blockId };
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 413) return { error: "파일이 너무 큽니다. 8MB까지 받습니다." };
      if (error.status === 415) return { error: "PNG · JPEG · WebP · GIF만 받습니다." };
    }
    return { error: error instanceof Error ? error.message : "이미지를 놓지 못했습니다." };
  }
}
