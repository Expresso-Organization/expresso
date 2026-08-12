import { describe, expect, it } from "vitest";

import { readImageMeta, UnsupportedImageError } from "./image.js";

/**
 * 바이트가 무엇인지 말하게 한다.
 *
 * 여기서 틀리면 **클라이언트가 말한 형식을 믿는 것과 같아진다** — `image/png`라고
 * 적고 아무거나 올릴 수 있게 된다. 우리는 이걸 방문자 브라우저로 그대로 내보낸다.
 */

function png(width: number, height: number): Buffer {
  const bytes = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0);
  bytes.write("IHDR", 12, "ascii");
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

function gif(width: number, height: number): Buffer {
  const bytes = Buffer.alloc(10);
  bytes.write("GIF89a", 0, "ascii");
  bytes.writeUInt16LE(width, 6);
  bytes.writeUInt16LE(height, 8);
  return bytes;
}

/** SOI → 건너뛸 APP0 세그먼트 하나 → SOF0. 실제 파일의 모양이다. */
function jpeg(width: number, height: number): Buffer {
  const app0 = Buffer.alloc(20);
  app0.writeUInt16BE(0xffe0, 0);
  app0.writeUInt16BE(18, 2);
  const sof = Buffer.alloc(11);
  sof.writeUInt16BE(0xffc0, 0);
  sof.writeUInt16BE(9, 2);
  sof.writeUInt8(8, 4);
  sof.writeUInt16BE(height, 5);
  sof.writeUInt16BE(width, 7);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof]);
}

function webpLossy(width: number, height: number): Buffer {
  const bytes = Buffer.alloc(30);
  bytes.write("RIFF", 0, "ascii");
  bytes.write("WEBP", 8, "ascii");
  bytes.write("VP8 ", 12, "ascii");
  bytes.writeUInt16LE(width, 26);
  bytes.writeUInt16LE(height, 28);
  return bytes;
}

describe("이미지 머리 읽기", () => {
  it("네 형식의 가로세로를 읽는다", () => {
    expect(readImageMeta(png(1440, 900))).toEqual({ mimeType: "image/png", width: 1440, height: 900 });
    expect(readImageMeta(gif(320, 240))).toEqual({ mimeType: "image/gif", width: 320, height: 240 });
    // JPEG는 세그먼트를 걸어가야 한다 — 크기 앞에 무엇이 놓일지는 파일마다 다르다.
    expect(readImageMeta(jpeg(1200, 675))).toEqual({ mimeType: "image/jpeg", width: 1200, height: 675 });
    expect(readImageMeta(webpLossy(800, 600))).toEqual({ mimeType: "image/webp", width: 800, height: 600 });
  });

  it("확장자를 믿지 않는다 — 바이트가 아니면 거절한다", () => {
    // SVG는 스크립트를 담을 수 있는 문서다. 남의 포트폴리오를 여는 일이
    // 스크립트를 실행하는 일이 되어서는 안 된다.
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>');
    expect(() => readImageMeta(svg)).toThrow(UnsupportedImageError);
    expect(() => readImageMeta(Buffer.from("%PDF-1.7"))).toThrow(UnsupportedImageError);
    expect(() => readImageMeta(Buffer.alloc(0))).toThrow(UnsupportedImageError);
    // 머리만 맞고 뒤가 잘린 파일도 통과시키지 않는다.
    expect(() => readImageMeta(png(10, 10).subarray(0, 14))).toThrow(UnsupportedImageError);
  });
});
