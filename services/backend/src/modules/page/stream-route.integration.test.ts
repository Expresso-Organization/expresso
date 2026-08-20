import { randomUUID } from "node:crypto";

import Fastify from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { registerErrorHandler } from "../../api/error-handler.js";
import { createStreamRedis } from "../../platform/redis.js";
import { registerPageRoutes } from "./routes.js";
import type { PageGenerator } from "./generator.js";
import type { PageService } from "./service.js";
import { PageStream } from "./stream.js";

/**
 * SSE 자리를 **진짜 HTTP로** 연다.
 *
 * `app.inject`로는 여기를 못 잰다 — 이 라우트는 응답을 `reply.hijack()`으로
 * 가로채 조각을 밀어 넣기 때문이다. 헤더 · 프레이밍 · 끝나는 자리, 셋 다
 * 소켓을 열어 봐야 드러난다.
 *
 * 특히 `x-accel-buffering`이 빠지면 **앞단 nginx가 조각을 모아 뒀다 한꺼번에**
 * 흘린다. 그러면 코드는 다 맞는데 화면에서만 실시간이 사라지고, 로컬에서는
 * nginx가 없어 끝까지 안 보인다.
 */

// 인프라를 요구하는 다른 통합 테스트와 같은 변수를 본다. 없으면 건너뛴다.
const redisUrl = process.env.TEST_REDIS_URL;
const describeWithRedis = redisUrl ? describe : describe.skip;

const OWNER = "owner-user";
const PORTFOLIO = randomUUID();

/** 이 자리가 보는 것은 소유 여부 하나뿐이다. 나머지는 부르지 않는다. */
const service = {
  owns: async (userId: string) => userId === OWNER,
} as unknown as PageService;

// 건너뛸 때는 Redis도 소켓도 열지 않는다. 최상단에서 열면 이 파일을 건너뛰어도
// 붙을 곳 없는 Redis에 매달려 실행이 끝나지 않는다.
let redis: ReturnType<typeof createStreamRedis>;
let stream: PageStream;
let app: ReturnType<typeof Fastify>;
let origin: string;

async function baseUrl(): Promise<string> {
  return origin;
}

describeWithRedis("지면 스트림 라우트", () => {
  beforeAll(async () => {
    redis = createStreamRedis(redisUrl!);
    stream = new PageStream(redis, { prefix: `test-route-${process.pid}` });

    app = Fastify();
    app.decorateRequest("auth", null);
    // 404·401을 상태 코드로 옮기는 것은 이 핸들러다. 없으면 전부 500으로 뭉갠다.
    registerErrorHandler(app);
    registerPageRoutes(app, {
      service,
      generator: {} as PageGenerator,
      stream,
      authenticateRequest: async (request) => {
        const userId = request.headers["x-test-user"];
        if (typeof userId !== "string") throw new Error("no user");
        request.auth = { user: { id: userId } } as never;
      },
    });

    await app.listen({ port: 0, host: "127.0.0.1" });
    const address = app.server.address();
    if (typeof address === "string" || !address) throw new Error("no address");
    origin = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await app.close();
    redis.disconnect();
  });

  it("남의 지면은 열어 주지 않는다", async () => {
    const response = await fetch(`${await baseUrl()}/v1/portfolios/${PORTFOLIO}/page/stream`, {
      headers: { "x-test-user": "someone-else" },
    });
    expect(response.status).toBe(404);
    await response.text();
  });

  it("조각을 SSE로 흘리고 done에서 닫는다", async () => {
    const url = `${await baseUrl()}/v1/portfolios/${PORTFOLIO}/page/stream`;
    const openedAt = Date.now();
    const response = await fetch(url, { headers: { "x-test-user": OWNER } });

    /*
     * **열리는 순간을 잰다.** `writeHead`만 하면 헤더가 첫 조각까지 안 나가고,
     * 그러면 브라우저는 3분 내내 연결이 안 된 줄 안다. 실측에서 여기가 첫
     * 하트비트가 나가는 15초까지 막혀 있었다.
     */
    expect(Date.now() - openedAt).toBeLessThan(1_000);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    // 앞단이 모아 두지 못하게 하는 두 줄. 빠지면 실시간이 배포에서만 사라진다.
    expect(response.headers.get("x-accel-buffering")).toBe("no");
    expect(response.headers.get("cache-control")).toContain("no-transform");

    await stream.begin(PORTFOLIO, "null");
    await stream.delta(PORTFOLIO, '{"html":"<p>안녕');
    await stream.delta(PORTFOLIO, ' 세상</p>"');
    await stream.done(PORTFOLIO, "33333333-3333-4333-8333-333333333333");

    let body = "";
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    // `done`을 쓴 뒤 서버가 소켓을 닫는다 — 여기가 끝나는 것이 곧 그 증거다.
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      body += decoder.decode(value, { stream: true });
    }

    const events = body.split("\n\n").filter((block) => block.startsWith("id: "));
    expect(events.map((block) => /event: (\w+)/.exec(block)?.[1]))
      .toEqual(["begin", "delta", "delta", "done"]);
    // 조각을 이어 붙이면 모델이 쓴 그대로다.
    const text = events
      .flatMap((block) => {
        const data = /data: (.*)/.exec(block)?.[1];
        if (!data || !block.includes("event: delta")) return [];
        return [(JSON.parse(data) as { text: string }).text];
      })
      .join("");
    expect(text).toBe('{"html":"<p>안녕 세상</p>"');
  });
});
