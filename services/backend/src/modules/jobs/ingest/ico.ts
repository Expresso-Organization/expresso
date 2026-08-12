import { deflateSync } from "node:zlib";

/**
 * ICO 안의 그림을 PNG로 꺼낸다.
 *
 * 회사들이 큰 마크를 `.ico`로만 걸어 두는 경우가 있다. 쿠팡 뉴스룸이 그렇다 —
 * `favicon.ico`가 **256×256**인데, 우리가 저장하는 형식은 PNG뿐이라 그냥은
 * 못 쓴다. 여기서 한 번 옮긴다.
 *
 * 저장 형식을 PNG로 좁혀 둔 것은 그대로 둔다(0048). 형식이 하나면 내보내는
 * 라우트도 화면도 예외를 안 만든다.
 *
 * ## 다루는 것
 *
 * - **안쪽이 PNG인 ICO**: 요즘 큰 아이콘은 대개 이렇다. 그대로 꺼낸다.
 * - **32bpp BMP**: 쿠팡의 것이 이 모양이다. 픽셀을 옮겨 PNG로 다시 쓴다.
 *
 * 24bpp 이하는 받지 않는다. 알파가 XOR 데이터 뒤의 1비트 AND 마스크에 따로
 * 들어 있고 팔레트까지 얽히는데, **손에 든 표본이 없다.** 안 해 본 갈래를
 * 짐작으로 써 두면 언젠가 조용히 깨진 그림이 화면에 선다 — 그때는 그 표본을
 * 보고 넓히면 된다.
 */
export function icoToPng(bytes: Buffer): Buffer | null {
  const entry = largestEntry(bytes);
  if (!entry) return null;

  const image = bytes.subarray(entry.offset, entry.offset + entry.size);
  if (image.length < 40) return null;
  // 안쪽이 이미 PNG면 옮길 것이 없다.
  if (image.subarray(0, 8).equals(PNG_SIGNATURE)) return image;

  return bmpToPng(image);
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** ICO는 그림 여러 장을 담는다. 가장 큰 것을 고른다. */
function largestEntry(bytes: Buffer): { offset: number; size: number; area: number } | null {
  if (bytes.length < 6) return null;
  // reserved(0) · type(1=ICO) · count
  if (bytes.readUInt16LE(0) !== 0 || bytes.readUInt16LE(2) !== 1) return null;
  const count = bytes.readUInt16LE(4);
  if (count === 0 || bytes.length < 6 + count * 16) return null;

  let best: { offset: number; size: number; area: number } | null = null;
  for (let index = 0; index < count; index += 1) {
    const at = 6 + index * 16;
    // 0은 256을 뜻한다. 한 바이트에 256이 안 들어가서 생긴 규칙이다.
    const width = bytes[at] || 256;
    const height = bytes[at + 1] || 256;
    const size = bytes.readUInt32LE(at + 8);
    const offset = bytes.readUInt32LE(at + 12);
    if (offset + size > bytes.length) continue;
    const area = width * height;
    if (!best || area > best.area) best = { offset, size, area };
  }
  return best;
}

/**
 * ICO 안의 32bpp BMP를 PNG로.
 *
 * 헤더는 BITMAPINFOHEADER 40바이트고, 거기 적힌 높이는 **실제의 두 배**다 —
 * 색 그림(XOR) 아래에 1비트 마스크(AND)가 붙기 때문이다. 32bpp는 알파를
 * 스스로 들고 있어 마스크를 볼 필요가 없다.
 *
 * 픽셀은 아래에서 위로, 한 점은 BGRA 순서다.
 */
function bmpToPng(image: Buffer): Buffer | null {
  const headerSize = image.readUInt32LE(0);
  if (headerSize !== 40) return null;
  const width = image.readInt32LE(4);
  const height = Math.floor(image.readInt32LE(8) / 2);
  const bitCount = image.readUInt16LE(14);
  const compression = image.readUInt32LE(16);
  if (width <= 0 || height <= 0 || bitCount !== 32 || compression !== 0) return null;

  const pixels = image.subarray(headerSize);
  if (pixels.length < width * height * 4) return null;

  // PNG 한 줄은 앞에 필터 바이트(0 = 필터 없음)가 붙는다.
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (1 + width * 4);
    raw[rowStart] = 0;
    // BMP는 아래 줄이 먼저다. 뒤집어 읽는다.
    const source = (height - 1 - y) * width * 4;
    for (let x = 0; x < width; x += 1) {
      const from = source + x * 4;
      const to = rowStart + 1 + x * 4;
      raw[to] = image[headerSize + from + 2] ?? 0; // R ← BGRA의 R
      raw[to + 1] = image[headerSize + from + 1] ?? 0; // G
      raw[to + 2] = image[headerSize + from] ?? 0; // B
      raw[to + 3] = image[headerSize + from + 3] ?? 0; // A
    }
  }

  return Buffer.concat([
    PNG_SIGNATURE,
    chunk("IHDR", ihdr(width, height)),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function ihdr(width: number, height: number): Buffer {
  const data = Buffer.alloc(13);
  data.writeUInt32BE(width, 0);
  data.writeUInt32BE(height, 4);
  data[8] = 8; // 채널당 8비트
  data[9] = 6; // 색 방식 6 = RGBA
  data[10] = 0; // 압축 (deflate 하나뿐)
  data[11] = 0; // 필터 방식
  data[12] = 0; // 인터레이스 없음
  return data;
}

/** PNG 덩어리 하나: 길이 · 이름 · 내용 · CRC. CRC는 이름과 내용에만 건다. */
function chunk(name: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(name, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(bytes: Buffer): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = (CRC_TABLE[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
