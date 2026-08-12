import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { readImageMeta } from "./image.js";
import { buildVariants, orientedSize, variantWidthsFor } from "./transcode.js";

/**
 * 내보낼 크기 만들기.
 *
 * 여기서 지키는 것은 셋이다 — 계단이 원본을 넘지 않는가, 정말로 작아지는가,
 * 그리고 **사진의 방향과 위치 정보**를 옳게 다루는가.
 */

/** 진짜 PNG를 만든다. 머리만 맞춘 가짜로는 인코더를 검증할 수 없다. */
async function png(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      width, height, channels: 3,
      // 단색은 비현실적으로 잘 압축된다. 화면 캡처처럼 결이 있게 만든다.
      background: { r: 240, g: 244, b: 250 },
    },
  })
    .composite([{
      input: await sharp({
        create: { width: Math.max(1, width >> 1), height: Math.max(1, height >> 1), channels: 3, background: { r: 20, g: 30, b: 60 } },
      }).png().toBuffer(),
      top: 0, left: 0,
    }])
    .png()
    .toBuffer();
}

describe("내보낼 크기", () => {
  it("계단은 원본을 넘지 않고 상한에서 멈춘다", () => {
    // 작은 그림에는 계단이 없다 — 없는 화소를 지어내지 않는다.
    expect(variantWidthsFor(400)).toEqual([400]);
    expect(variantWidthsFor(900)).toEqual([640, 900]);
    expect(variantWidthsFor(1600)).toEqual([640, 1280, 1600]);
    // 큰 원본은 상한(2560)에서 자른다. 지면에 그보다 크게 놓일 자리가 없다.
    expect(variantWidthsFor(6000)).toEqual([640, 1280, 1920, 2560]);
  });

  it("PNG 캡처를 폭별 WebP로 바꾸고 확실히 작아진다", async () => {
    const original = await png(2400, 1400);
    const variants = await buildVariants(original, readImageMeta(original));

    expect(variants.map(({ width }) => width)).toEqual([640, 1280, 1920, 2400]);
    for (const variant of variants) {
      expect(variant.mimeType).toBe("image/webp");
      // 비율을 지킨다.
      expect(variant.height).toBe(Math.round((variant.width * 1400) / 2400));
    }
    // 폰이 받는 것이 원본보다 훨씬 작아야 이 작업이 의미가 있다.
    const smallest = variants[0]!;
    expect(smallest.bytes.length).toBeLessThan(original.length / 5);
    // 계단은 커질수록 무거워진다.
    for (let index = 1; index < variants.length; index += 1) {
      expect(variants[index]!.bytes.length).toBeGreaterThan(variants[index - 1]!.bytes.length);
    }
  });

  it("EXIF 방향을 적용하고 위치 정보는 버린다", async () => {
    // 폰으로 세로로 찍은 사진 — 바이트는 가로이고 EXIF가 "돌려서 봐라"라고 적혀 있다.
    const rotated = await sharp({
      create: { width: 1200, height: 800, channels: 3, background: { r: 10, g: 120, b: 90 } },
    })
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();

    // 머리만 읽으면 가로다 — EXIF를 봐야 세로인 줄 안다.
    expect(readImageMeta(rotated)).toMatchObject({ width: 1200, height: 800 });
    expect(await orientedSize(rotated, readImageMeta(rotated))).toEqual({ width: 800, height: 1200 });

    const variants = await buildVariants(rotated, readImageMeta(rotated));
    const largest = variants.at(-1)!;
    const meta = await sharp(largest.bytes).metadata();

    // 방향을 적용했으므로 세로가 된다. 안 하면 사진이 옆으로 눕는다.
    expect(meta.height).toBeGreaterThan(meta.width!);
    // 위치 정보는 남기지 않는다 — 남에게 보내라고 만든 페이지에 싣는 그림이다.
    expect(meta.exif).toBeUndefined();
  });

  it("움직이는 GIF는 프레임을 잃지 않는다", async () => {
    const frames = await sharp({
      create: { width: 200, height: 400, channels: 3, background: { r: 200, g: 30, b: 30 } },
    }).gif().toBuffer();
    const variants = await buildVariants(frames, readImageMeta(frames));
    expect(variants.length).toBeGreaterThan(0);
    // 한 장짜리 GIF라도 높이가 프레임 수만큼 늘어나 있으면 안 된다.
    expect(variants[0]!.height).toBe(400);
  });
});
