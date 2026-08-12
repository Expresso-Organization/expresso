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
