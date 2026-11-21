import {
  MongoClient,
  MongoClientClosedError,
  MongoNetworkError,
  MongoNotConnectedError,
  MongoServerSelectionError,
  MongoTopologyClosedError,
} from "mongodb";
import type { Db } from "mongodb";
import { setTimeout as delay } from "node:timers/promises";

import type { ReadinessCheck } from "../modules/system/readiness.js";

export const MONGO_SERVER_SELECTION_TIMEOUT_MS = 3_000;

function someErrorInCauseChain(error: unknown, matches: (candidate: unknown) => boolean): boolean {
  const seen = new Set<unknown>();
  for (let candidate = error; candidate instanceof Error && !seen.has(candidate); candidate = candidate.cause) {
    if (matches(candidate)) return true;
    seen.add(candidate);
  }
  return false;
}

/**
 * 이 클라이언트가 다시 열리지 않는 오류인가.
 *
 * 드라이버는 첫 연결이 실패하면 topology를 닫고도 `client.topology`를 비우지 않습니다. 그 뒤 모든 작업이 같은
 * 오류로 끝납니다. 2026-11-04 운영 Worker가 이 상태로 이틀을 돌았습니다. 재시도로는 풀리지 않으니 프로세스를 끝냅니다.
 */
export function isMongoClientClosedError(error: unknown): boolean {
  return someErrorInCauseChain(error, (candidate) =>
    candidate instanceof MongoTopologyClosedError
    || candidate instanceof MongoNotConnectedError
    || candidate instanceof MongoClientClosedError);
}

/**
 * Mongo에 닿지 못해 실패한 오류인가. 잡의 내용과 무관하므로 잡의 시도 횟수를 쓰지 않습니다.
 *
 * 인증 실패 같은 서버 응답(`MongoServerError`)은 넣지 않습니다. 서버가 답한 거절은 기다려도 풀린다는 근거가 없습니다.
 */
export function isMongoUnavailableError(error: unknown): boolean {
  return isMongoClientClosedError(error) || someErrorInCauseChain(error, (candidate) =>
    candidate instanceof MongoServerSelectionError
    || candidate instanceof MongoNetworkError);
}

/**
 * 연결될 때까지 다시 시도합니다. 끝나지 않고 살아 있어야 하는 프로세스(API)가 씁니다.
 *
 * `connect()`는 닫힌 topology를 새것으로 바꾸므로 같은 클라이언트를 쥔 서비스는 그대로 살아납니다. 한 번 연결한 뒤의
 * 장애는 드라이버 모니터가 복구하므로 여기서 끝납니다. 거부하지 않습니다.
 *
 * 인증 실패처럼 바로 돌아오는 오류에서 쉬지 않고 돌지 않게, 시도 사이에 서버 선택 시간만큼 쉽니다.
 * `client.close()` 뒤에 `connect()`를 부르면 클라이언트가 다시 열립니다. 닫기 전에 반드시 `signal`로 멈춥니다.
 */
export async function connectMongoUntilReady(
  client: Pick<MongoClient, "connect">,
  options: { signal: AbortSignal; onRetry(error: unknown): void },
): Promise<void> {
  while (!options.signal.aborted) {
    try {
      await client.connect();
      return;
    } catch (error) {
      if (options.signal.aborted) return;
      options.onRetry(error);
    }
    await delay(MONGO_SERVER_SELECTION_TIMEOUT_MS, undefined, { signal: options.signal }).catch(() => undefined);
  }
}

export interface MongoContext {
  client: MongoClient;
  db: Db;
}

export interface MongoResource extends MongoContext {
  readinessCheck: ReadinessCheck;
  close(): Promise<void>;
}

export interface MongoResourceOptions {
  databaseName?: string;
}

export function createMongoResource(
  uri: string,
  options?: MongoResourceOptions,
): MongoResource {
  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: MONGO_SERVER_SELECTION_TIMEOUT_MS,
    // 기본값 2는 배포 직후 동시 요청에서 pool 생성을 직렬화해 p95를 밀어 올린다.
    maxConnecting: 16,
    // readiness 이후에도 작은 준비 pool을 유지해 첫 사용자 burst가 소켓 생성 시간을
    // 함께 부담하지 않게 한다. API와 Worker를 합쳐도 16개라 단일 서버 한도 안이다.
    minPoolSize: 8,
  });
  const db = client.db(options?.databaseName);

  client.on("error", () => {
    // 연결 오류는 readiness 결과로만 확인하며 인증 정보가 포함될 수 있는 오류를 출력하지 않습니다.
  });

  return {
    client,
    db,
    readinessCheck: {
      name: "mongodb",
      async run() {
        const hello = await db.command({ hello: 1 });
        if (hello.setName !== "rs0" || !hello.isWritablePrimary) {
          throw new Error("MongoDB primary is unavailable");
        }
        const latest = await db.collection<{ _id: string; state: string }>("schema_migrations").findOne({ _id: "0004", state: "applied" });
        if (!latest) throw new Error("MongoDB schema migration 0004 is not applied");
        const indexes = await db.collection("analytics_rate_limits").indexExists(["rate_expiry", "analytics_rate_window_key"]);
        if (!indexes) throw new Error("MongoDB required indexes are missing");
      },
    },
    async close() {
      await client.close();
    },
  };
}
