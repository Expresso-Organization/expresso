import { partialRecipeSections, RecipeDraftSchema } from "@expresso/contracts";
import { describe, expect, it } from "vitest";
import type { z } from "zod";

import type { AiCallOptions, AiCallSpec, AiClient, AiResult } from "../../platform/ai/client.js";
import { AiRecipePlanner, type PlannerContext, type RecipePlanSink } from "./planner.js";

/**
 * 짜이는 동안이 밖으로 나가는가.
 *
 * 여기서 조용히 틀어질 자리가 둘이다 — **조각을 아예 안 넘기는 것**(감싼
 * 클라이언트가 세 번째 인자를 빠뜨리는 실수는 지면 쪽에서 실제로 한 번 났다),
 * 그리고 **흘려보낸 것을 받는 쪽이 못 읽는 것**. 둘 다 화면만 3분 동안
 * 조용해지고 서버 로그에는 아무 흔적이 없다.
 */

const DRAFT = RecipeDraftSchema.parse({
  sections: [
    {
      title: "조용히 틀리는 파이프라인을 막다",
      purpose: "검증을 설계에 넣은 사람이라는 것을 보인다",
      targetLength: 420,
      goal: "데이터 품질 요건에 답한다",
      points: ["사고 발견 3일"],
      metrics: ["12분"],
      tone: "담백하게",
      format: "narrative",
      exclude: ["과장"],
      takeaway: "값이 아니라 신뢰를 검증했다",
      contentPattern: "case-study",
      interactionOpportunity: null,
      items: [
        { pointText: "환율 컬럼이 3일간 null로 들어왔다", sources: [1] },
        { pointText: "발견은 재무팀이 먼저였다", sources: [1] },
      ],
    },
  ],
  unused: [],
});

const context: PlannerContext = {
  sources: [{ type: "record", id: "r1", label: "적재 파이프라인", text: "환율 컬럼이 3일간 null." }],
  company: null,
  jobTitle: "백엔드 엔지니어",
  requirements: [],
  companyResearch: [],
  totalLength: 900,
};

class StreamingStubAi implements AiClient {
  readonly streams = true;
  saw: AiCallOptions | undefined;

  async complete<T>(_spec: AiCallSpec, schema: z.ZodType<T>, options: AiCallOptions = {}): Promise<AiResult<T>> {
    this.saw = options;
    options.onThinking?.(50);
    const encoded = JSON.stringify(DRAFT);
    // 실제로 오는 조각처럼 잘라 보낸다 — 언제나 값 한가운데다.
    for (let at = 0; at < encoded.length; at += 37) options.onPartial?.(encoded.slice(at, at + 37));
    return {
      data: schema.parse(DRAFT),
      usage: {
        model: "stub", inputTokens: 0, outputTokens: 0, cacheReadTokens: 0,
        cacheCreationTokens: 0, costUsd: 0, durationMs: 0,
      },
    };
  }
}

function recorder() {
  let buffer = "";
  let thoughts = 0;
  const sink: RecipePlanSink = {
    delta: (text) => { buffer += text; },
    thinking: (tokens) => { thoughts = tokens; },
  };
  return { sink, read: () => buffer, thought: () => thoughts };
}

describe("레시피 짜기 스트리밍", () => {
  it("흘려보낸 조각이 받는 쪽에서 같은 레시피로 읽힌다", async () => {
    const { sink, read, thought } = recorder();
    await new AiRecipePlanner(new StreamingStubAi()).plan(context, sink);

    expect(thought()).toBe(50);
    // 화면이 실제로 하는 일이 이것이다. 통로만 재고 끝내면 못 그리는 것을 못 잡는다.
    const [section] = partialRecipeSections(read());
    expect(section?.title).toBe("조용히 틀리는 파이프라인을 막다");
    expect(section?.takeaway).toBe("값이 아니라 신뢰를 검증했다");
    expect(section?.items).toEqual([
      "환율 컬럼이 3일간 null로 들어왔다",
      "발견은 재무팀이 먼저였다",
    ]);
  });

  it("받을 곳이 없으면 조각을 달라고 하지 않는다", async () => {
    // 조각을 켜면 CLI가 이벤트를 통째로 더 뱉는다. 안 볼 것을 받아 둘 이유가 없다.
    const ai = new StreamingStubAi();
    await new AiRecipePlanner(ai).plan(context);
    expect(ai.saw?.onPartial).toBeUndefined();
    expect(ai.saw?.onThinking).toBeUndefined();
  });
});
