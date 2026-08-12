import { MEDIA_VARIANT_WIDTHS, MEDIA_MAX_SERVED_WIDTH } from "@expresso/contracts";
import sharp from "sharp";

import type { ImageMeta } from "./image.js";

/**
 * 올린 그림을 **내보낼 수 있는 크기로** 바꾼다.
 *
 * 공개되는 지면이고 그걸 여는 사람은 대개 폰이다. 4,000px짜리 PNG 캡처를 그대로
 * 내보내면 8MB가 나가고, 그러면 지면이 아무리 좋아도 열리기 전에 닫힌다.
 *
 * 원본은 지운 적이 없다 — 저장소에 그대로 두고 **내보내는 것만** 바꾼다.
 * 나중에 더 나은 인코더가 생기면 원본에서 다시 만들면 된다.
 *
 * 세 가지를 한다:
 *
 * 1. **폭 계단을 만든다.** 640 · 1280 · 1920 · 2560. 지면은 `srcset`으로 브라우저에
 *    고르게 하고, 폰은 640만 받는다.
 * 2. **WebP로 바꾼다.** 같은 화면 캡처가 PNG의 1/5~1/10이다.
 * 3. **메타데이터를 버린다.** 사진에는 촬영 위치가 들어 있을 수 있고, 우리는 이걸
 *    남에게 보내라고 만든 페이지에 싣는다. 방향(orientation)만 먼저 적용하고
 *    나머지는 떨군다 — 안 그러면 폰으로 찍은 사진이 옆으로 눕는다.
 */

export interface ImageVariant {
  width: number;
  height: number;
  bytes: Buffer;
  mimeType: "image/webp";
}

/**
 * EXIF 방향을 적용한 **실제로 보이는** 크기.
 *
 * 폰으로 세로로 찍은 사진은 바이트가 가로이고 "돌려서 봐라"가 EXIF에 적혀 있다.
 * 머리만 읽는 `readImageMeta`는 그 사실을 모르므로 가로세로가 뒤바뀐 값을 준다 —
 * 그대로 두면 지면이 가로 자리를 잡아 두고 세로 사진이 들어와 글이 밀린다.
 */
export async function orientedSize(bytes: Buffer, meta: ImageMeta) {
  try {
    const { orientation } = await sharp(bytes).metadata();
    // 5–8은 90도 회전이 섞인 값이다. 그때만 가로세로가 바뀐다.
    if (orientation !== undefined && orientation >= 5 && orientation <= 8) {
      return { width: meta.height, height: meta.width };
    }
  } catch {
    // 읽지 못하면 머리에서 읽은 값을 그대로 믿는다.
  }
  return { width: meta.width, height: meta.height };
}

/**
 * 어떤 폭들을 만들 것인가.
 *
 * 원본보다 크게 늘리지 않는다(없는 화소를 지어내는 일이다). 원본이 상한보다
 * 크면 상한에서 자른다 — 지면에 2,560px보다 크게 놓일 자리가 없다.
 */
export function variantWidthsFor(originalWidth: number): number[] {
  const cap = Math.min(originalWidth, MEDIA_MAX_SERVED_WIDTH);
  const ladder = MEDIA_VARIANT_WIDTHS.filter((width) => width < cap);
  return [...new Set([...ladder, cap])].sort((left, right) => left - right);
}

/**
 * 변형을 만든다. **실패해도 던지지 않는다** — 변형이 없으면 원본을 내보내면
 * 되지만, 여기서 던지면 사용자가 올린 그림이 통째로 사라진다.
 */
export async function buildVariants(bytes: Buffer, meta: ImageMeta): Promise<ImageVariant[]> {
  // 움직이는 GIF는 프레임을 전부 들고 가야 한다. 안 그러면 첫 장만 남는다.
  const animated = meta.mimeType === "image/gif";
  const variants: ImageVariant[] = [];
  // 계단은 **보이는 폭**을 기준으로 놓는다. 회전된 사진은 그게 원본 바이트의
  // 폭과 다르다.
  const display = await orientedSize(bytes, meta);

  for (const width of variantWidthsFor(display.width)) {
    try {
      const pipeline = sharp(bytes, animated ? { animated: true } : {})
        // EXIF 방향을 먼저 적용한다. 이 뒤에 메타데이터는 버려진다.
        .rotate()
        .resize({ width, withoutEnlargement: true })
        .webp({ quality: 82, effort: 4 });
      const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
      variants.push({
        width: info.width,
        // 움직이는 그림은 프레임이 세로로 쌓여 나온다. 한 장의 높이를 쓴다.
        height: animated && info.pages && info.pages > 1
          ? Math.round(info.height / info.pages)
          : info.height,
        bytes: data,
        mimeType: "image/webp",
      });
    } catch (error) {
      console.error(JSON.stringify({
        level: "warn",
        event: "media.variant_failed",
        width,
        message: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  // 원본보다 큰 변형은 쓸모가 없다 — 그런 게 나오면 버린다.
  return variants.filter((variant) =>
    variant.bytes.length < bytes.length || variant.width < display.width);
}
