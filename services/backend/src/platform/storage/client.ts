/**
 * 파일 저장 포트.
 *
 * 도메인은 이 인터페이스만 본다 — 디스크인지 객체 저장소인지 모른다.
 * AI 포트와 같은 모양이고 같은 이유다: 프로바이더를 바꾸면 `platform/storage/`
 * 안에서 끝난다.
 *
 * 키는 **우리가 정한다.** 사용자가 준 파일 이름은 키에 넣지 않는다 —
 * 경로를 벗어나는 이름(`../`)과 인코딩 장난이 전부 거기서 나온다.
 */

export interface StoredObject {
  bytes: Buffer;
  mimeType: string;
}

export interface MediaStorage {
  put(key: string, bytes: Buffer, mimeType: string): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  delete(key: string): Promise<void>;
}

export class StorageError extends Error {
  constructor(message: string, options: { cause?: unknown } = {}) {
    super(message, options.cause === undefined ? {} : { cause: options.cause });
    this.name = "StorageError";
  }
}

/** `{userId}/{assetId}` — 사용자별로 갈라 두면 계정 삭제가 디렉터리 하나다. */
export function storageKeyFor(userId: string, assetId: string): string {
  return `${userId}/${assetId}`;
}
