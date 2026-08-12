import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";

import { StorageError, type MediaStorage, type StoredObject } from "./client.js";

/**
 * 로컬 디스크 어댑터.
 *
 * 개발과 단일 서버 배포까지 이걸로 돈다. 여러 대로 늘리는 순간 못 쓰지만,
 * 그때 바꿀 것은 이 파일 하나다.
 *
 * MIME은 파일과 따로 두지 않는다 — DB의 `media_asset.mime_type`이 사실이고,
 * 여기서는 바이트만 지킨다. 두 곳에 적어 두면 언젠가 어긋난다.
 */
export class LocalMediaStorage implements MediaStorage {
  readonly #root: string;

  constructor(root: string) {
    this.#root = resolve(root);
  }

  /**
   * 키를 실제 경로로 옮긴다.
   *
   * 키는 우리가 만들지만 **여기서 한 번 더 확인한다.** 저장소 밖으로 나가는
   * 경로는 어떤 경로로 들어왔든 사고다.
   */
  #pathFor(key: string): string {
    const path = resolve(join(this.#root, key));
    if (path !== this.#root && !path.startsWith(this.#root + sep)) {
      throw new StorageError(`storage key escapes the root: ${key}`);
    }
    return path;
  }

  async put(key: string, bytes: Buffer): Promise<void> {
    const path = this.#pathFor(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes);
  }

  async get(key: string): Promise<StoredObject | null> {
    try {
      const bytes = await readFile(this.#pathFor(key));
      // MIME은 부르는 쪽이 DB에서 들고 온다. 여기서는 바이트만 돌려준다.
      return { bytes, mimeType: "application/octet-stream" };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw new StorageError(`failed to read ${key}`, { cause: error });
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.#pathFor(key), { force: true });
  }
}
