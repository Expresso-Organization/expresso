import { MEDIA_MIME_TYPES, type MediaMimeType } from "@expresso/contracts";

/**
 * 이미지의 머리만 읽는다.
 *
 * **왜 우리가 읽는가.** 클라이언트가 말한 형식을 믿으면 `image/png`라고 적고
 * 아무거나 올릴 수 있다. 우리는 이걸 방문자 브라우저에 그대로 내보내므로,
 * 무엇인지는 **바이트가 말해야 한다.**
 *
 * 그리고 가로세로가 필요하다. 지면이 자리를 미리 잡아야 그림이 뜰 때 글이
 * 밀리지 않는다(레이아웃 시프트).
 *
 * 라이브러리를 쓰지 않는다 — 네 형식의 머리 몇 바이트를 읽는 일이고, 이미지
 * 처리 의존성은 네이티브 빌드를 끌고 온다.
 */

export interface ImageMeta {
  mimeType: MediaMimeType;
  width: number;
  height: number;
}

export class UnsupportedImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedImageError";
  }
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function readPng(bytes: Buffer): ImageMeta | null {
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
  // 첫 청크는 반드시 IHDR이고, 거기 8바이트가 가로세로다.
  if (bytes.toString("ascii", 12, 16) !== "IHDR") return null;
  return {
    mimeType: "image/png",
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

function readGif(bytes: Buffer): ImageMeta | null {
  if (bytes.length < 10) return null;
  const header = bytes.toString("ascii", 0, 6);
  if (header !== "GIF87a" && header !== "GIF89a") return null;
  return {
    mimeType: "image/gif",
    width: bytes.readUInt16LE(6),
    height: bytes.readUInt16LE(8),
  };
}

/**
 * JPEG는 세그먼트를 걸어가야 한다. 크기는 SOF 세그먼트에만 있고 그 앞에 몇 개가
 * 놓일지는 파일마다 다르다.
 */
function readJpeg(bytes: Buffer): ImageMeta | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1] ?? 0;
    // SOF0–SOF15. DHT(c4) · JPG(c8) · DAC(cc)는 크기를 담지 않는다.
    const isFrameHeader = marker >= 0xc0 && marker <= 0xcf
      && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrameHeader) {
      return {
        mimeType: "image/jpeg",
        height: bytes.readUInt16BE(offset + 5),
        width: bytes.readUInt16BE(offset + 7),
      };
    }
    // 세그먼트 길이는 마커 바로 뒤 2바이트이고 자기 자신을 포함한다.
    const length = bytes.readUInt16BE(offset + 2);
    if (length < 2) return null;
    offset += 2 + length;
  }
  return null;
}

/** WebP는 세 벌이다 — 손실(VP8) · 무손실(VP8L) · 확장(VP8X). 셋 다 자리가 다르다. */
function readWebp(bytes: Buffer): ImageMeta | null {
  if (bytes.length < 30) return null;
  if (bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WEBP") {
    return null;
  }
  const chunk = bytes.toString("ascii", 12, 16);
  if (chunk === "VP8 ") {
    return {
      mimeType: "image/webp",
      width: bytes.readUInt16LE(26) & 0x3fff,
      height: bytes.readUInt16LE(28) & 0x3fff,
    };
  }
  if (chunk === "VP8L") {
    // 14비트씩 붙어 있고 둘 다 1을 뺀 값으로 적힌다.
    const packed = bytes.readUInt32LE(21);
    return {
      mimeType: "image/webp",
      width: (packed & 0x3fff) + 1,
      height: ((packed >> 14) & 0x3fff) + 1,
    };
  }
  if (chunk === "VP8X") {
    const read24 = (at: number) =>
      (bytes[at] ?? 0) | ((bytes[at + 1] ?? 0) << 8) | ((bytes[at + 2] ?? 0) << 16);
    return {
      mimeType: "image/webp",
      width: read24(24) + 1,
      height: read24(27) + 1,
    };
  }
  return null;
}

const READERS = [readPng, readJpeg, readWebp, readGif];

/**
 * 바이트가 무엇인지 말하게 한다. 우리가 아는 넷이 아니면 거절한다.
 *
 * SVG가 여기 없는 것은 실수가 아니다 — 스크립트를 담을 수 있는 문서 형식이고,
 * 남의 포트폴리오를 여는 일이 스크립트를 실행하는 일이 되어서는 안 된다.
 */
export function readImageMeta(bytes: Buffer): ImageMeta {
  for (const reader of READERS) {
    const meta = reader(bytes);
    if (meta) {
      if (meta.width < 1 || meta.height < 1) {
        throw new UnsupportedImageError("이미지 크기를 읽을 수 없습니다");
      }
      return meta;
    }
  }
  throw new UnsupportedImageError(
    `지원하지 않는 형식입니다 (${MEDIA_MIME_TYPES.join(" · ")}만 받습니다)`,
  );
}
