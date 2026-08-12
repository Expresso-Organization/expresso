import { z } from "zod";

import { TimestampSchema, UuidSchema } from "./common.js";

/**
 * 사용자가 올린 이미지.
 *
 * 지면에 그림을 넣는 길은 둘이다. 하나는 `chart` — 근거의 수치로 **우리가 그린다**.
 * 다른 하나가 이것 — 화면 캡처 · 로고 · 사진처럼 **만들어 낼 수 없는 것**이다.
 * 디자이너 · 기획자 포트폴리오는 이쪽이 없으면 성립하지 않는다.
 *
 * 여기서 정하는 것은 **무엇을 받는가**이고, 어디에 두는가는 저장소 포트가 정한다
 * (`platform/storage`). 로컬 디스크로 시작하고 객체 저장소로 바꿔도 계약은 그대로다.
 */

/**
 * 받는 형식.
 *
 * SVG는 **받지 않는다.** 스크립트를 담을 수 있는 문서 형식이고, 우리는 이걸
 * 방문자 브라우저에 그대로 내보낸다. 남의 포트폴리오를 여는 일이 스크립트를
 * 실행하는 일이 되어서는 안 된다.
 */
export const MEDIA_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;
export const MediaMimeTypeSchema = z.enum(MEDIA_MIME_TYPES);

/**
 * 한 장의 상한.
 *
 * 8MB는 "페이지에 넣을 그림"의 상한이다. 이보다 큰 파일은 대개 원본을 줄이지 않고
 * 올린 것이고, 그대로 내보내면 공고를 보는 사람의 폰에서 페이지가 열리지 않는다.
 */
export const MEDIA_MAX_BYTES = 8 * 1024 * 1024;

/**
 * 내보낼 폭 계단.
 *
 * 640은 폰, 1280은 노트북, 1920·2560은 큰 화면과 레티나다. 지면은 `srcset`으로
 * 이 계단을 내밀고 **브라우저가 고른다** — 폰은 640만 받는다.
 */
export const MEDIA_VARIANT_WIDTHS = [640, 1280, 1920, 2560] as const;

/**
 * 내보내는 최대 폭.
 *
 * 원본은 지우지 않지만 **이보다 크게는 내보내지 않는다.** 포트폴리오 지면에
 * 2,560px보다 크게 놓일 자리가 없고, 그보다 큰 것을 내보내는 것은 받는 사람의
 * 데이터를 쓰는 일이다.
 */
export const MEDIA_MAX_SERVED_WIDTH = 2560;

export const MediaAssetSchema = z.strictObject({
  id: UuidSchema,
  mimeType: MediaMimeTypeSchema,
  /** 원본 픽셀. 지면이 자리를 미리 잡아 그림이 뜰 때 글이 밀리지 않게 한다. */
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  bytes: z.number().int().positive(),
  /** 내보낼 수 있는 폭들. 비어 있으면 원본 하나뿐이다. */
  variants: z.array(z.number().int().positive()).default([]),
  createdAt: TimestampSchema,
});

export const MediaAssetResponseSchema = z.strictObject({ data: MediaAssetSchema });

/**
 * 그림을 어떤 액자에 넣을까.
 *
 * 제품 화면 캡처는 **액자가 있어야 제품으로 보인다** — 브라우저 창이나 폰 몸체
 * 없이 스크린샷만 눕히면 그냥 이미지 파일이다. 액자는 렌더러가 그리므로
 * 사용자가 목업을 따로 만들어 올릴 필요가 없다.
 */
export const MEDIA_FRAMES = ["none", "browser", "phone"] as const;
export const MediaFrameSchema = z.enum(MEDIA_FRAMES);

/** `media` 블록의 content. */
export const PortfolioMediaSchema = z.strictObject({
  assetId: UuidSchema,
  /** 무엇이 보이는지. 화면 낭독기가 이걸 읽고, 그림이 안 뜨면 이 글이 남는다. */
  alt: z.string().trim().max(200),
  caption: z.string().trim().max(300).optional(),
  frame: MediaFrameSchema.default("none"),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  /**
   * 이 그림을 내보낼 수 있는 폭들. **블록에 구워 둔다** — 배포 스냅샷은 그 시점의
   * 지면을 그대로 얼려야 하고, 나중에 변형이 늘거나 줄어도 이미 나간 페이지의
   * `srcset`이 달라지면 안 된다.
   */
  variants: z.array(z.number().int().positive()).default([]),
});

/** 04에서 지면에 그림을 한 장 놓는다. */
export const CreateMediaBlockSchema = z.strictObject({
  assetId: UuidSchema,
  alt: z.string().trim().max(200).default(""),
  caption: z.string().trim().max(300).optional(),
  frame: MediaFrameSchema.default("none"),
  /** 이 섹션 안 어디에. 비우면 맨 뒤. */
  afterBlockId: UuidSchema.optional(),
});

export const MediaBlockParamsSchema = z.strictObject({
  id: UuidSchema,
  sectionId: UuidSchema,
});

export const MediaAssetParamsSchema = z.strictObject({ id: UuidSchema });

/**
 * `?w=` — 브라우저가 `srcset`에서 고른 폭.
 *
 * 아무 수나 받지 않는다. 임의의 폭을 허용하면 주소가 무한히 갈라져 캐시가
 * 쓸모없어지고, 우리는 그 폭들을 미리 만들어 두지도 않았다.
 */
export const MediaWidthQuerySchema = z.strictObject({
  w: z.coerce.number().int().positive().max(MEDIA_MAX_SERVED_WIDTH).optional(),
});

export type MediaMimeType = z.infer<typeof MediaMimeTypeSchema>;
export type MediaAsset = z.infer<typeof MediaAssetSchema>;
export type MediaFrame = z.infer<typeof MediaFrameSchema>;
export type PortfolioMedia = z.infer<typeof PortfolioMediaSchema>;
export type CreateMediaBlock = z.infer<typeof CreateMediaBlockSchema>;

/** 블록 content에 저장된 그림을 읽는다. 옛 블록이나 깨진 값은 null이다. */
export function parseMediaContent(content: unknown): PortfolioMedia | null {
  const parsed = PortfolioMediaSchema.safeParse(content);
  return parsed.success ? parsed.data : null;
}

/**
 * 그림을 내려받는 주소.
 *
 * **서명이 없다.** 서명한 주소는 유효기간이 있고, 포트폴리오는 링크 하나로 남에게
 * 건네는 물건이다 — 어제 보낸 링크의 그림이 오늘 깨지면 안 된다. 대신 주소는
 * 추측할 수 없는 UUID이고, 이 그림들은 애초에 공개 지면에 실릴 것들이다.
 * (내보내기 산출물처럼 **받는 사람이 정해진** 자산은 여전히 서명한 주소를 쓴다.)
 */
export function mediaAssetUrl(baseUrl: string, assetId: string, width?: number): string {
  const base = `${baseUrl.replace(/\/+$/, "")}/v1/media/${assetId}`;
  return width === undefined ? base : `${base}?w=${width}`;
}

/**
 * `srcset` 한 줄.
 *
 * 폭마다 주소를 하나씩 내밀고 **브라우저가 고르게** 한다. 우리가 화면 크기를
 * 추측해 하나를 고르는 것보다 낫다 — 브라우저는 화면 밀도와 실제 배치 폭을
 * 알고 우리는 모른다.
 */
export function mediaSrcSet(baseUrl: string, media: PortfolioMedia): string | undefined {
  if (media.variants.length === 0) return undefined;
  return media.variants
    .map((width) => `${mediaAssetUrl(baseUrl, media.assetId, width)} ${width}w`)
    .join(", ");
}
