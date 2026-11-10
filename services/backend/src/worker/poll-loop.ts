import { setTimeout as delay } from "node:timers/promises";

import { isMongoClientClosedError } from "../platform/mongodb.js";
import type { Wake } from "./outbox-wake.js";

export interface PollLoopOptions {
  intervalMs: number;
  signal: AbortSignal;
  poll(): Promise<void>;
  /** 다음 주기에 다시 시도할 오류입니다. 연결된 topology는 Mongo가 돌아오면 드라이버가 스스로 복구합니다. */
  onError(error: unknown): void;
  /** 다시 시도해도 풀리지 않는 오류입니다. 이 함수를 부른 뒤 루프가 끝납니다. */
  onFatal(error: unknown): void;
  /** 있으면 대기 중에 알림을 받아 바로 다음 주기를 돈다. 없으면 `intervalMs`를 다 기다린다. */
  wake?: Wake;
}

export async function runPollLoop(options: PollLoopOptions): Promise<void> {
  while (!options.signal.aborted) {
    try {
      await options.poll();
    } catch (error) {
      if (isMongoClientClosedError(error)) {
        options.onFatal(error);
        return;
      }
      options.onError(error);
    }

    try {
      if (options.wake) await options.wake.sleep(options.intervalMs, options.signal);
      else await delay(options.intervalMs, undefined, { signal: options.signal });
    } catch (error) {
      if (!options.signal.aborted) throw error;
    }
  }
}
