import type { Redis } from "ioredis";

import { DraftStream, type DraftStreamOptions } from "../../platform/draft-stream.js";

/**
 * 짜이는 레시피가 흐르는 통로.
 *
 * **왜 있는가.** 레시피 하나가 실측 150초다(sonnet · 재료 10건). 그동안 화면은
 * 진행 막대 하나만 돌리고 있었고, 사용자가 아는 것은 "아직"뿐이었다. 흐르는
 * 것은 `RecipeDraftSchema` 모양의 JSON 하나가 잘린 조각들이고, 화면은
 * `partialRecipeSections`로 그중 그릴 수 있는 데까지를 읽는다.
 *
 * **열쇠는 brew job id다.** 레시피 id는 다 끝나야 생기는데 화면은 그 전부터
 * 열려 있다. 잡은 첫 렌더부터 있다 — 지면 쪽이 포트폴리오가 아니라 생성 잡으로
 * 여는 것과 같은 이유다.
 */

/** 흐르는 것. `done`이나 `failed`가 오면 그 레시피의 이야기는 끝이다. */
export type RecipeStreamMessage =
  /**
   * 모델을 부르기 시작했다.
   *
   * 실어 나르는 것이 없어도 필요하다 — 큐가 다시 부르면(`retryable`) 같은
   * 열쇠에 두 번째 판이 쌓이고, 받는 쪽은 앞 판의 조각에 이어 붙여 **깨진
   * JSON**을 읽는다. 이 신호가 오면 받는 쪽은 처음부터 다시 담는다.
   */
  | { id: string; event: "begin" }
  | { id: string; event: "delta"; text: string }
  /** 아직 안 쓰지만 생각하고 있다. 값은 지금까지 쌓인 분량이다. */
  | { id: string; event: "thinking"; tokens: number }
  | { id: string; event: "done"; recipeId: string }
  | { id: string; event: "failed"; code: string };

export class RecipeStream extends DraftStream<RecipeStreamMessage> {
  constructor(redis: Redis, options: DraftStreamOptions = {}) {
    super(redis, "recipe-stream", options);
  }

  async begin(jobId: string): Promise<void> {
    await this.reset(jobId);
    await this.append(jobId, ["event", "begin"]);
  }

  async thinking(jobId: string, tokens: number): Promise<void> {
    await this.append(jobId, ["event", "thinking", "tokens", String(tokens)]);
  }

  async delta(jobId: string, text: string): Promise<void> {
    await this.append(jobId, ["event", "delta", "text", text]);
  }

  async done(jobId: string, recipeId: string): Promise<void> {
    await this.append(jobId, ["event", "done", "recipeId", recipeId]);
  }

  async failed(jobId: string, code: string): Promise<void> {
    await this.append(jobId, ["event", "failed", "code", code]);
  }

  protected decode(id: string, fields: Map<string, string>): RecipeStreamMessage | null {
    const event = fields.get("event");
    if (event === "begin") return { id, event };
    if (event === "delta") return { id, event, text: fields.get("text") ?? "" };
    if (event === "thinking") return { id, event, tokens: Number(fields.get("tokens") ?? 0) };
    if (event === "done") return { id, event, recipeId: fields.get("recipeId") ?? "" };
    if (event === "failed") return { id, event, code: fields.get("code") ?? "" };
    return null;
  }
}
