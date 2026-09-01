import type { Redis } from "ioredis";

import { DraftStream, type DraftStreamOptions } from "../../platform/draft-stream.js";

/**
 * 만들어지는 지면이 흐르는 통로.
 *
 * 나르는 일 자체는 `DraftStream`이 한다 — Redis Stream에 쌓고, 늦게 붙은
 * 사람에게도 처음부터 흘린다. 여기서 정하는 것은 **무엇이 흐르는가**뿐이다.
 */

/** 흐르는 것. `done`이나 `failed`가 오면 그 지면의 이야기는 끝이다. */
export type PageStreamMessage =
  /**
   * 이 지면이 무슨 문법으로 만들어지는가.
   *
   * 조각만으로는 미리보기를 그릴 수 없다. 지면은 키트를 쓰고(`useKit`), 키트의
   * 모든 규칙은 문법이 정한 변수를 먹고 돈다 — 변수가 없으면 모델이 쓴 `k-*`
   * 클래스에 규칙이 하나도 안 붙어 지면이 통째로 무너진다. **스트림 하나만
   * 보고도 그릴 수 있어야** 늦게 붙은 사람도 같은 것을 본다.
   */
  | { id: string; event: "begin"; style: string }
  | { id: string; event: "delta"; text: string }
  /**
   * 아직 안 쓰지만 생각하고 있다. 값은 지금까지 쌓인 분량이다.
   *
   * 화면에 숫자를 쓰라는 것이 아니라 **단계를 가르라**는 신호다 — 이게 오는
   * 동안은 구상 중이고, `delta`가 오기 시작하면 쓰는 중이다.
   */
  | { id: string; event: "thinking"; tokens: number }
  | { id: string; event: "done"; pageId: string }
  | { id: string; event: "failed"; code: string };

export type PageStreamOptions = DraftStreamOptions;

export class PageStream extends DraftStream<PageStreamMessage> {
  constructor(redis: Redis, options: PageStreamOptions = {}) {
    super(redis, "page-stream", options);
  }

  /**
   * 새 판을 시작한다. 문법을 함께 알린다 — 값은 `PageStyleGrammar`를 JSON으로
   * 적은 것이고, 없으면 `"null"`이다.
   */
  async begin(portfolioId: string, style: string): Promise<void> {
    await this.reset(portfolioId);
    await this.append(portfolioId, ["event", "begin", "style", style]);
  }

  async thinking(portfolioId: string, tokens: number): Promise<void> {
    await this.append(portfolioId, ["event", "thinking", "tokens", String(tokens)]);
  }

  async delta(portfolioId: string, text: string): Promise<void> {
    await this.append(portfolioId, ["event", "delta", "text", text]);
  }

  async done(portfolioId: string, pageId: string): Promise<void> {
    await this.append(portfolioId, ["event", "done", "pageId", pageId]);
  }

  async failed(portfolioId: string, code: string): Promise<void> {
    await this.append(portfolioId, ["event", "failed", "code", code]);
  }

  protected decode(id: string, fields: Map<string, string>): PageStreamMessage | null {
    const event = fields.get("event");
    if (event === "begin") return { id, event, style: fields.get("style") ?? "null" };
    if (event === "delta") return { id, event, text: fields.get("text") ?? "" };
    if (event === "thinking") return { id, event, tokens: Number(fields.get("tokens") ?? 0) };
    if (event === "done") return { id, event, pageId: fields.get("pageId") ?? "" };
    if (event === "failed") return { id, event, code: fields.get("code") ?? "" };
    return null;
  }
}
