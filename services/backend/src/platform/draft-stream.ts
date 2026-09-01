import type { FastifyReply, FastifyRequest } from "fastify";
import type { Redis } from "ioredis";

/**
 * 만들어지는 것을 워커에서 브라우저까지 나르는 길.
 *
 * **왜 필요한가.** 생성은 워커에서 돌고 브라우저는 API에 붙는다. 둘은 다른
 * 프로세스라 서로를 부를 방법이 없었다 — 지금까지 워커가 끝을 알리는 유일한
 * 수단은 잡의 상태를 쓰는 것이었고, 그건 **끝났다는 사실**만 나른다.
 * 만들어지는 중을 보여주려면 중간이 흘러야 한다.
 *
 * **왜 pub/sub이 아니라 Stream인가.** pub/sub은 그 순간 듣고 있는 사람에게만
 * 간다. 한 번이 2~3분이라 그 사이 새로고침 한 번이면 앞부분을 영영 놓치고,
 * 화면에는 가운데가 빈 결과가 남는다. Stream은 처음부터 다시 읽을 수 있어
 * 늦게 붙은 사람도 같은 것을 본다.
 *
 * 여기 있는 것은 **지면과 레시피가 함께 쓰는 뼈대**다. 무엇이 흐르는지는 각
 * 스트림이 정한다(`decode`).
 */

/** 흐르는 것의 최소 모양. `id`는 Redis가 매긴 자리표다. */
export interface DraftStreamMessage {
  id: string;
  event: string;
}

export interface DraftStreamOptions {
  /** 큐와 같은 접두어를 쓴다. 한 Redis에 여러 환경이 들어와도 안 섞인다. */
  prefix?: string;
  ttlSeconds?: number;
}

/**
 * 흔적이 남아 있는 시간.
 *
 * 가장 긴 생성 한 번의 상한이 900초다(`PageService.generate`의 `withTimeout`).
 * 그 두 배를 둔다 — 다 만들어진 뒤에 붙은 사람도 처음부터 볼 수 있어야 하고,
 * 그보다 오래 살아 있을 이유는 없다. 완성본은 데이터베이스에 있다.
 */
const DEFAULT_TTL_SECONDS = 1_800;

/**
 * 한 번 기다리는 길이.
 *
 * 이 값은 지연이 아니라 **떠난 사람을 알아채기까지의 시간**이다. 조각이 오면
 * 그 즉시 깨어나므로 화면이 느려지지 않는다. 브라우저가 닫혔을 때 붙잡고 있던
 * Redis 연결을 놓기까지 최대 이만큼 걸린다.
 */
const BLOCK_MS = 15_000;

export abstract class DraftStream<M extends DraftStreamMessage> {
  protected readonly redis: Redis;
  readonly #channel: string;
  readonly #prefix: string;
  readonly #ttlSeconds: number;

  protected constructor(redis: Redis, channel: string, options: DraftStreamOptions = {}) {
    this.redis = redis;
    this.#channel = channel;
    this.#prefix = options.prefix ?? "expresso";
    this.#ttlSeconds = options.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  }

  key(streamId: string): string {
    return `${this.#prefix}:${this.#channel}:${streamId}`;
  }

  /** 낱개 필드 배열을 다시 메시지로. 모르는 이름은 버린다 — 옛 흔적일 수 있다. */
  protected abstract decode(id: string, fields: Map<string, string>): M | null;

  /**
   * 처음부터 따라 읽는다.
   *
   * **연결을 하나 복제해서 쓴다.** `XREAD BLOCK`은 그 연결을 붙잡고 있어서,
   * 공유 연결로 하면 같은 클라이언트를 쓰는 다른 명령이 전부 그 뒤에 선다.
   * 보는 사람 하나당 연결 하나이고, 다 읽거나 떠나면 놓는다.
   */
  async *follow(streamId: string, options: { signal?: AbortSignal } = {}): AsyncGenerator<M> {
    const key = this.key(streamId);
    const reader = this.redis.duplicate();
    // 0 — 처음부터. 늦게 붙은 사람이 앞부분을 놓치지 않는 이유가 이 한 글자다.
    let cursor = "0";
    try {
      while (!options.signal?.aborted) {
        const response = await reader.xread("BLOCK", BLOCK_MS, "STREAMS", key, cursor);
        if (!response) continue;
        for (const [, entries] of response) {
          for (const [id, fields] of entries) {
            cursor = id;
            const map = new Map<string, string>();
            for (let at = 0; at + 1 < fields.length; at += 2) map.set(fields[at]!, fields[at + 1]!);
            const message = this.decode(id, map);
            if (!message) continue;
            yield message;
            if (message.event === "done" || message.event === "failed") return;
          }
        }
      }
    } finally {
      reader.disconnect();
    }
  }

  protected async append(streamId: string, fields: string[]): Promise<void> {
    const key = this.key(streamId);
    await this.redis
      .multi()
      .xadd(key, "*", ...fields)
      // 쓸 때마다 다시 건다. 마지막 조각으로부터 이만큼이 이 판의 수명이다.
      .expire(key, this.#ttlSeconds)
      .exec();
  }

  /**
   * 앞의 흔적을 지운다.
   *
   * 같은 열쇠로 다시 뽑는 자리가 있다(04b의 재생성 · 큐의 재시도). 안 지우면
   * 새로 붙은 사람이 처음부터 읽다가 **직전 판의 `done`에서 닫는다** — 이번
   * 것은 한 글자도 못 보고 끝난 줄 안다. 실제로 첫 실전에서 이걸로 걸렸다.
   */
  protected async reset(streamId: string): Promise<void> {
    await this.redis.del(this.key(streamId));
  }
}

/**
 * 조용해도 살아 있다고 알리는 간격.
 *
 * 모델이 생각만 하는 구간은 몇 분씩 간다. 그동안 한 바이트도 안 나가면
 * 앞단(nginx `proxy_read_timeout 900`)과 브라우저가 죽은 연결로 보고 끊는다.
 * `BLOCK_MS`와 같은 값이라 둘의 리듬이 어긋나지 않는다.
 */
const HEARTBEAT_MS = 15_000;

/**
 * 스트림 하나를 SSE로 흘려보낸다.
 *
 * **소유 확인은 부르는 쪽이 이미 끝냈다고 본다.** 이 함수는 누구 것인지 모른다 —
 * 잡으로 여는 자리와 포트폴리오로 여는 자리가 각자 아는 방법으로 확인한다.
 */
export async function writeDraftStream(
  request: FastifyRequest,
  reply: FastifyReply,
  stream: DraftStream<DraftStreamMessage>,
  streamId: string,
): Promise<void> {
  reply.hijack();
  const raw = reply.raw;
  raw.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    // `no-transform`이 없으면 중간 프록시가 압축하며 모아 둔다.
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    // nginx에게 이 응답만 버퍼링하지 말라고 한다. 설정 파일을 안 고쳐도 된다.
    "x-accel-buffering": "no",
  });
  /*
   * 헤더를 **지금** 내보낸다.
   *
   * `writeHead`는 적어 두기만 하고 첫 `write()`가 있어야 나간다. 한 번이 첫
   * 조각까지 몇 분이 걸릴 수 있어서, 이게 없으면 그동안 브라우저의
   * `EventSource`가 **열리지도 않는다** — 실측에서 첫 하트비트가 나가는
   * 15초까지 `fetch`가 응답조차 못 받았다.
   */
  raw.flushHeaders();

  const abort = new AbortController();
  request.raw.on("close", () => abort.abort());
  const beat = setInterval(() => raw.write(": ping\n\n"), HEARTBEAT_MS);
  try {
    for await (const message of stream.follow(streamId, { signal: abort.signal })) {
      if (abort.signal.aborted) break;
      const { id, event, ...body } = message;
      raw.write(`id: ${id}\nevent: ${event}\ndata: ${JSON.stringify(body)}\n\n`);
    }
  } finally {
    clearInterval(beat);
    raw.end();
  }
}
