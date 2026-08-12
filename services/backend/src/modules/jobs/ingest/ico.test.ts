import { describe, expect, it } from "vitest";

import { icoToPng } from "./ico.js";
import { pngSize } from "./logo.js";

/**
 * ICO 꺼내기 시험.
 *
 * 표본은 손으로 짠다. 실제 파일(쿠팡 뉴스룸의 256×256)로 확인한 것은
 * **픽셀 65,536개가 한 점도 다르지 않다**는 것이었고, 그 파일을 저장소에
 * 넣어 둘 이유는 없다. 여기서는 같은 구조를 작게 만들어 본다.
 */

/** 32bpp BMP를 담은 ICO 한 장. `fill(x, y)`가 RGBA를 준다. */
function icoWithBmp(
  size: number,
  fill: (x: number, y: number) => [number, number, number, number],
): Buffer {
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(size, 4);
  // 적히는 높이는 실제의 두 배다 — 색 그림 아래에 마스크가 붙기 때문이다.
  header.writeInt32LE(size * 2, 8);
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(32, 14);

  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const [r, g, b, a] = fill(x, y);
      // BMP는 아래 줄이 먼저고, 한 점은 BGRA다.
      const at = ((size - 1 - y) * size + x) * 4;
      pixels[at] = b;
      pixels[at + 1] = g;
      pixels[at + 2] = r;
      pixels[at + 3] = a;
    }
  }

  const image = Buffer.concat([header, pixels]);
  return Buffer.concat([directory(size, image.length), image]);
}

function directory(size: number, imageLength: number): Buffer {
  const dir = Buffer.alloc(22);
  dir.writeUInt16LE(0, 0);
  dir.writeUInt16LE(1, 2); // type 1 = ICO
  dir.writeUInt16LE(1, 4); // 그림 한 장
  dir[6] = size === 256 ? 0 : size; // 0은 256을 뜻한다
  dir[7] = size === 256 ? 0 : size;
  dir.writeUInt16LE(1, 10);
  dir.writeUInt16LE(32, 12);
  dir.writeUInt32LE(imageLength, 14);
  dir.writeUInt32LE(22, 18);
  return dir;
}

describe("32bpp BMP를 담은 ICO", () => {
  it("PNG로 꺼내고 크기가 그대로다", () => {
    const png = icoToPng(icoWithBmp(64, () => [10, 20, 30, 255]));
    expect(png).not.toBeNull();
    expect(pngSize(png!)).toEqual({ width: 64, height: 64 });
  });

  it("색이 뒤바뀌지 않는다 — BGRA를 RGBA로 옮긴다", async () => {
    // 왼쪽 위만 빨강, 나머지는 투명. 채널이나 위아래가 뒤집히면 여기서 걸린다.
    const png = icoToPng(
      icoWithBmp(64, (x, y) => (x < 32 && y < 32 ? [255, 0, 0, 255] : [0, 0, 0, 0])),
    );
    expect(png).not.toBeNull();
    const pixels = await decode(png!);
    expect([...pixels.subarray(0, 4)]).toEqual([255, 0, 0, 255]); // 왼쪽 위
    const bottomRight = ((63 * 64) + 63) * 4;
    expect(pixels[bottomRight + 3]).toBe(0); // 오른쪽 아래는 투명
  });

  it("256×256은 디렉터리에 0으로 적힌다", () => {
    const png = icoToPng(icoWithBmp(256, () => [1, 2, 3, 255]));
    expect(pngSize(png!)).toEqual({ width: 256, height: 256 });
  });
});

describe("안쪽이 이미 PNG인 ICO", () => {
  it("옮기지 않고 그대로 꺼낸다", () => {
    const inner = icoToPng(icoWithBmp(64, () => [7, 8, 9, 255]))!;
    const wrapped = Buffer.concat([directory(64, inner.length), inner]);
    expect(icoToPng(wrapped)?.equals(inner)).toBe(true);
  });
});

describe("못 다루는 것", () => {
  it("ICO가 아니면 null이다", () => {
    expect(icoToPng(Buffer.from("<!DOCTYPE html>"))).toBeNull();
    expect(icoToPng(Buffer.alloc(3))).toBeNull();
  });

  it("24bpp는 받지 않는다 — 알파가 따로 있고 표본이 없다", () => {
    const ico = icoWithBmp(64, () => [1, 2, 3, 255]);
    ico.writeUInt16LE(24, 22 + 14); // 헤더의 비트 수만 바꾼다
    expect(icoToPng(ico)).toBeNull();
  });

  it("가리키는 자리가 파일 밖이면 null이다", () => {
    const ico = icoWithBmp(64, () => [1, 2, 3, 255]);
    ico.writeUInt32LE(999_999, 18);
    expect(icoToPng(ico)).toBeNull();
  });
});

/** PNG를 다시 RGBA로. 우리가 쓴 것이 진짜 PNG인지 확인하는 데만 쓴다. */
async function decode(png: Buffer): Promise<Buffer> {
  const { inflateSync } = await import("node:zlib");
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  // IHDR 다음 덩어리가 IDAT다.
  let at = 8 + 25;
  let data = Buffer.alloc(0);
  while (at < png.length) {
    const length = png.readUInt32BE(at);
    const name = png.subarray(at + 4, at + 8).toString("ascii");
    if (name === "IDAT") data = Buffer.concat([data, png.subarray(at + 8, at + 8 + length)]);
    at += 12 + length;
  }
  const raw = inflateSync(data);
  const pixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    // 줄마다 앞의 필터 바이트를 걷어낸다.
    raw.copy(pixels, y * width * 4, y * (1 + width * 4) + 1, (y + 1) * (1 + width * 4));
  }
  return pixels;
}
