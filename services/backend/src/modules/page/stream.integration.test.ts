import { afterAll, describe, expect, it } from "vitest";

import { createStreamRedis } from "../../platform/redis.js";
import { PageStream, type PageStreamMessage } from "./stream.js";

/**
 * 통로 자체를 재는 자리.
 *
 * 여기서 확인하는 것은 두 가지다 — **순서**와 **늦게 온 사람**. 지면 조각은
 * 순서가 어긋나면 그냥 깨진 HTML이 되고, 3분짜리 생성 중에 새로고침 한 번이면
 * 늦게 붙는 일이 실제로 일어난다.
 */
// 인프라를 요구하는 다른 통합 테스트와 같은 변수를 본다. 없으면 건너뛴다 —
// 붙을 곳 없는 Redis를 기다리다 시간 초과로 죽는 것보다 낫다.
const redisUrl = process.env.TEST_REDIS_URL;
const describeWithRedis = redisUrl ? describe : describe.skip;

const redis = redisUrl ? createStreamRedis(redisUrl) : null;
const stream = redis ? new PageStream(redis, { prefix: `test-${process.pid}` }) : null;

afterAll(async () => {
  redis?.disconnect();
});

async function collect(portfolioId: string): Promise<PageStreamMessage[]> {
  const seen: PageStreamMessage[] = [];
  for await (const message of stream!.follow(portfolioId)) seen.push(message);
  return seen;
}

describeWithRedis("PageStream", () => {
  it("늦게 붙어도 처음부터 다 받는다", async () => {
    const portfolioId = `late-${process.pid}`;
    await stream!.delta(portfolioId, '{"css":"body{');
    await stream!.delta(portfolioId, 'margin:0}","html":"<p>안녕');
    await stream!.done(portfolioId, "11111111-1111-4111-8111-111111111111");

    // 다 끝난 뒤에 붙는다 — 새로고침하고 돌아온 사람이 이 자리다.
    const seen = await collect(portfolioId);
    expect(seen.map(({ event }) => event)).toEqual(["delta", "delta", "done"]);
    expect(seen.filter((m) => m.event === "delta").map((m) => m.text).join(""))
      .toBe('{"css":"body{margin:0}","html":"<p>안녕');
  });

  it("흐르는 동안 붙어도 순서대로 받는다", async () => {
    const portfolioId = `live-${process.pid}`;
    const watching = collect(portfolioId);
    for (const text of ["a", "b", "c"]) await stream!.delta(portfolioId, text);
    await stream!.failed(portfolioId, "AI_TIMEOUT");

    const seen = await watching;
    expect(seen.map((m) => (m.event === "delta" ? m.text : m.event)))
      .toEqual(["a", "b", "c", "failed"]);
  });

  it("다시 뽑으면 앞 판을 지우고 연다", async () => {
    const portfolioId = `again-${process.pid}`;
    await stream!.begin(portfolioId, "null");
    await stream!.delta(portfolioId, "첫 판");
    await stream!.done(portfolioId, "44444444-4444-4444-8444-444444444444");

    // 같은 이름으로 다시. 안 지우면 새로 붙은 사람이 앞 판의 done에서 닫힌다.
    await stream!.begin(portfolioId, "null");
    await stream!.delta(portfolioId, "두 번째 판");

    const seen: PageStreamMessage[] = [];
    for await (const message of stream!.follow(portfolioId)) {
      seen.push(message);
      if (seen.length === 2) break;
    }
    expect(seen.map(({ event }) => event)).toEqual(["begin", "delta"]);
    expect(seen[1]).toMatchObject({ text: "두 번째 판" });
  });

  it("청사진 · 글 자리 · 단계를 같은 값으로 되돌려 준다", async () => {
    const portfolioId = `blueprint-${process.pid}`;
    await stream!.blueprint(portfolioId, { html: '<p><span data-slot="/profile/role"></span></p>', css: ".a{}" });
    await stream!.stage(portfolioId, "designed");
    await stream!.fill(portfolioId, "/profile/role", "개발", false);
    await stream!.fill(portfolioId, "/profile/role", "개발자", true);
    await stream!.done(portfolioId, "55555555-5555-4555-8555-555555555555");

    const seen = (await collect(portfolioId)).map(({ id: _id, ...message }) => message);
    expect(seen).toEqual([
      { event: "blueprint", html: '<p><span data-slot="/profile/role"></span></p>', css: ".a{}" },
      { event: "stage", name: "designed" },
      { event: "fill", path: "/profile/role", text: "개발", done: false },
      { event: "fill", path: "/profile/role", text: "개발자", done: true },
      { event: "done", pageId: "55555555-5555-4555-8555-555555555555" },
    ]);
  });

});
