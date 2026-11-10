import { setTimeout as delay } from "node:timers/promises";

import { mongoCollections } from "@expresso/database";
import { MongoServerError, type Db } from "mongodb";

/**
 * 폴링 루프의 대기를 끊는 알림.
 *
 * 폴링 중에 들어온 알림은 버리지 않고 쌓아 두었다가 다음 대기를 건너뛴다 — 한 번 읽은 뒤
 * 새로 들어온 행을 다음 주기까지 기다리게 두지 않는다.
 */
export class Wake {
  #pending = false;
  #resolve: (() => void) | null = null;

  notify(): void {
    if (this.#resolve) {
      const resolve = this.#resolve;
      this.#resolve = null;
      resolve();
      return;
    }
    this.#pending = true;
  }

  /** `ms`가 지나거나 알림이 오거나 `signal`이 끊기면 돌아온다. 끊기면 `delay`처럼 거절한다. */
  async sleep(ms: number, signal: AbortSignal): Promise<void> {
    // 이미 끊긴 신호에는 abort 이벤트가 다시 오지 않는다 — `delay`처럼 바로 거절한다.
    signal.throwIfAborted();
    if (this.#pending) {
      this.#pending = false;
      return;
    }
    const woken = new Promise<void>((resolve) => { this.#resolve = resolve; });
    const timer = new AbortController();
    const stop = () => timer.abort();
    signal.addEventListener("abort", stop, { once: true });
    try {
      await Promise.race([woken, delay(ms, undefined, { signal: timer.signal })]);
    } catch (error) {
      if (!signal.aborted) throw error;
      throw signal.reason ?? error;
    } finally {
      this.#resolve = null;
      signal.removeEventListener("abort", stop);
      timer.abort();
    }
  }
}

/** Mongo가 권한 없음(13 Unauthorized)으로 거절했는가. */
function isUnauthorized(error: unknown): boolean {
  return error instanceof MongoServerError && error.code === 13;
}

/**
 * `outbox_events`에 행이 커밋되면 `onInsert`를 부른다. 워커가 1초 주기를 기다리지 않고 바로 발행하게 한다.
 *
 * 변경 흐름(change stream)은 커밋된 변경만 준다 — API 트랜잭션 안의 행이 보이기 전에 깨우는 일이 없다.
 * Mongo가 재시작되면 흐름이 끊긴다. 오류를 남기고 `retryMs` 뒤 다시 연다. 그동안 폴링은 그대로 돌므로
 * 이 함수가 멈춰도 발행이 늦어질 뿐 빠지지 않는다.
 */
export async function watchOutboxInserts(
  db: Db,
  onInsert: () => void,
  options: { retryMs: number; signal: AbortSignal; onError(error: unknown): void },
): Promise<void> {
  const { signal } = options;
  while (!signal.aborted) {
    const stream = mongoCollections(db).outboxEvents.watch([{ $match: { operationType: "insert" } }]);
    const close = () => { void stream.close(); };
    signal.addEventListener("abort", close, { once: true });
    try {
      for await (const _change of stream) onInsert();
    } catch (error) {
      if (signal.aborted) return;
      options.onError(error);
      // 권한이 없으면 다시 열어도 같은 답이다 — 1초마다 같은 오류를 남기지 않고 폴링에 맡긴다.
      // 운영 역할은 배포 때 `infra/mongodb/init-replica-set.js`가 올린다.
      if (isUnauthorized(error)) return;
    } finally {
      signal.removeEventListener("abort", close);
      await stream.close().catch(() => undefined);
    }
    if (signal.aborted) return;
    await delay(options.retryMs, undefined, { signal }).catch(() => undefined);
  }
}
