import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { PageStyleGrammarSchema } from "@expresso/contracts";

import type {
  AiCallOptions,
  AiCallSpec,
  AiClient,
  AiResult,
} from "../../platform/ai/client.js";
import { AiPageGenerator, type PageGenerationContext, type PageStreamSink } from "./generator.js";

/**
 * 만들어지는 동안이 밖으로 나가는가.
 *
 * 이 경로에서 조용히 틀어질 자리가 둘이다 — **조각을 아예 안 넘기는 것**(감싼
 * 클라이언트가 세 번째 인자를 빠뜨리는 실수는 실제로 한 번 났다), 그리고
 * **다시 쓰기 시작한다고 말하지 않는 것**. 뒤엣것이 더 나쁘다: 앞 시도 뒤에
 * 뒷 시도가 이어 붙어 받는 쪽에 앞뒤가 다른 JSON이 남고, 화면만 깨진 채
 * 서버 로그는 멀쩡하다.
 */

const DRAFT = {
  html: '<div class="k-page"><h1>박민재</h1></div>',
  css: "@media (min-width: 40rem){.k-page{padding:2rem}}"
    + "@media (prefers-reduced-motion: reduce){*{animation:none}}",
  rationale: "수치를 앞세웠다",
};

/** 지면이 소독 · 근거 대조를 지나되 수치는 없는, 가장 순한 입력. */
const context: PageGenerationContext = {
  portfolioPlan: null,
  sections: [{ title: "소개", purpose: "누구인지", goal: "", points: [], targetLength: 200 }],
  evidence: [{ label: "기록", text: "박민재는 백엔드를 만든다." }],
  media: [],
  jobTitle: null,
  company: null,
};

class StreamingStubAi implements AiClient {
  readonly streams = true;
  calls = 0;
  seen: AiCallSpec | undefined;
  constructor(private readonly failFirst: boolean) {}

  async complete<T>(
    spec: AiCallSpec,
    schema: z.ZodType<T>,
    options: AiCallOptions = {},
  ): Promise<AiResult<T>> {
    this.calls += 1;
    this.seen = spec;
    // 첫 시도는 QA에 걸릴 것(반응형 규칙이 없다). 그래도 조각은 흘렀다.
    const draft = this.failFirst && this.calls === 1
      ? { ...DRAFT, css: ".k-page{padding:2rem}" }
      : DRAFT;
    options.onThinking?.(50);
    const encoded = JSON.stringify(draft);
    for (let at = 0; at < encoded.length; at += 40) {
      options.onPartial?.(encoded.slice(at, at + 40));
    }
    return {
      data: schema.parse(draft),
      usage: {
        model: "stub", inputTokens: 0, outputTokens: 0, cacheReadTokens: 0,
        cacheCreationTokens: 0, costUsd: 0, durationMs: 0,
      },
    };
  }
}

function recorder() {
  const events: string[] = [];
  let buffer = "";
  let thoughts = 0;
  const sink: PageStreamSink = {
    delta: (text) => { events.push("delta"); buffer += text; },
    thinking: (tokens) => { events.push("thinking"); thoughts = tokens; },
  };
  return { sink, events, read: () => buffer, thought: () => thoughts };
}

describe("지면 생성 스트리밍", () => {
  it("참고 스타일 규칙을 생성에 사용하고 출처와 판본을 명세에 남긴다", async () => {
    const ai = new StreamingStubAi(false);
    const style = PageStyleGrammarSchema.parse({
      name: "Terminal", description: "고정폭 지면", toneTags: [],
      background: "#0a0a0a", text: "#33ff00", accent: "#33ff00",
      font: "mono", density: "compact", structure: "dense-grid",
      composition: "evidence-grid", typography: "technical", geometry: "ruled-sections",
      motion: "minimal", interaction: "comparison", imagery: "typography-first", antiPatterns: [],
      designReference: { code: "designprompts-terminal", sourceUrl: "https://www.designprompts.dev/terminal",
        version: 1, prompt: "프로젝트를 터미널 창으로 구분한다." },
    });
    const result = await new AiPageGenerator(ai).generate({ ...context, style });
    expect(ai.seen?.prompt).toContain("프로젝트를 터미널 창으로 구분한다.");
    expect(result.manifest).toMatchObject({
      promptVersions: { style: 1 }, tools: ["external-reference"],
      sourceUrls: ["https://www.designprompts.dev/terminal"],
    });
  });

  it("조각이 그대로 흘러 나온다", async () => {
    const { sink, events, read } = recorder();
    await new AiPageGenerator(new StreamingStubAi(false)).generate(context, sink);

    expect(events.filter((event) => event === "delta").length).toBeGreaterThan(1);
    // 지면이 나오기 전 침묵을 채우는 것. 실측 126초짜리 구간이라 **첫 조각보다
    // 먼저** 나와야 값이 있다.
    expect(events.indexOf("thinking")).toBeLessThan(events.indexOf("delta"));
    // 이어 붙인 것이 곧 모델이 낸 JSON이다 — 중간에 잃은 글자가 없다.
    expect(JSON.parse(read())).toEqual(DRAFT);
  });

  it("QA에 걸려도 다시 쓰지 않는다", async () => {
    // 한때 두 번까지 돌았다. 실측에서 그 재시도가 시간과 값을 그대로 두 배로
    // 만들었고(381초 → 217초, $0.94 → $0.49), 걸린 사유는 거의 전부 오탐이었다.
    const ai = new StreamingStubAi(true);
    const { sink } = recorder();
    await new AiPageGenerator(ai).generate(context, sink);

    expect(ai.calls).toBe(1);
  });

  it("받을 사람이 없으면 아무것도 안 한다", async () => {
    const ai = new StreamingStubAi(false);
    const result = await new AiPageGenerator(ai).generate(context);
    expect(result.rationale).toBe("수치를 앞세웠다");
  });
});

/**
 * 지면이 없는데 통과하는 일.
 *
 * 2026-08-14 실측에서 실제로 났다 — 모델이 마크업 대신 "저 파일을 보라"는
 * 문장 하나를 `html`로 냈는데 QA 일곱 개가 전부 통과하고 `ready`로 저장됐다.
 * 나머지 검사가 전부 **지면이 있다는 전제** 위에 서 있었기 때문이다.
 */
describe("지면이 있는지", () => {
  const draft = (html: string) => ({
    html,
    css: "@media (min-width: 40rem){.k-page{padding:2rem}}",
    rationale: "설명",
  });

  class FixedAi implements AiClient {
    constructor(private readonly reply: unknown) {}
    async complete<T>(_spec: AiCallSpec, schema: z.ZodType<T>): Promise<AiResult<T>> {
      return {
        data: schema.parse(this.reply),
        usage: {
          model: "stub", inputTokens: 0, outputTokens: 0, cacheReadTokens: 0,
          cacheCreationTokens: 0, costUsd: 0, durationMs: 0,
        },
      };
    }
  }

  it("마크업 대신 문장을 내면 걸린다", async () => {
    const ai = new FixedAi(draft("(see file portfolio.html content above — passed inline below)"));
    const result = await new AiPageGenerator(ai).generate(context);

    expect(result.qaReport.status).toBe("failed_qa");
    const markup = result.qaReport.checks.find(({ name }) => name === "has-markup");
    expect(markup?.status).toBe("fail");
    expect(markup?.detail).toContain("태그가 하나도 없습니다");
  });

  it("지면이 있으면 지난다", async () => {
    const ai = new FixedAi(draft('<div class="k-page"><h1>박민재</h1></div>'));
    const result = await new AiPageGenerator(ai).generate(context);

    expect(result.qaReport.checks.find(({ name }) => name === "has-markup")?.status).toBe("pass");
    expect(result.qaReport.status).toBe("ready");
  });
});
