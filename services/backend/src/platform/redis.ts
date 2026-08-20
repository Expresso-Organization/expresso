import { Redis } from "ioredis";

import type { ReadinessCheck } from "../modules/system/readiness.js";

export interface RedisResource {
  client: Redis;
  readinessCheck: ReadinessCheck;
  close(): Promise<void>;
}

export function createRedisResource(redisUrl: string): RedisResource {
  const client = new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  });
  client.on("error", () => {
    // The readiness result reports connectivity without emitting credentials or noise.
  });

  return {
    client,
    readinessCheck: {
      name: "redis",
      async run() {
        if (client.status === "wait" || client.status === "end") {
          await client.connect();
        }
        await client.ping();
      },
    },
    async close() {
      if (client.status === "wait" || client.status === "end") {
        client.disconnect();
        return;
      }

      await client.quit();
    },
  };
}

/**
 * 오래 붙어 있는 연결.
 *
 * `createRedisResource`의 클라이언트와 **일부러 다르다.** 그쪽은 준비 상태를
 * 있는 그대로 보고해야 해서 재접속을 끄는데(`retryStrategy: () => null`),
 * 지면 조각을 나르는 연결이 그러면 Redis가 한 번 깜빡인 뒤로 **그 프로세스가
 * 살아 있는 내내 아무것도 못 흘린다.**
 *
 * 만들어지는 지면을 따라 읽을 때는 여기서 다시 하나 복제한다
 * (`PageStream.follow`) — `XREAD BLOCK`이 연결을 붙잡기 때문이다.
 */
export function createStreamRedis(redisUrl: string): Redis {
  const client = new Redis(redisUrl, { lazyConnect: true });
  client.on("error", (error) => {
    console.error(JSON.stringify({
      level: "warn",
      event: "redis.stream_error",
      detail: error instanceof Error ? error.message : String(error),
    }));
  });
  return client;
}
