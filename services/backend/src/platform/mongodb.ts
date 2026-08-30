import { MongoClient } from "mongodb";
import type { Db } from "mongodb";

import type { ReadinessCheck } from "../modules/system/readiness.js";

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
    serverSelectionTimeoutMS: 3_000,
    // 기본값 2는 배포 직후 동시 요청에서 pool 생성을 직렬화해 p95를 밀어 올린다.
    maxConnecting: 16,
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
