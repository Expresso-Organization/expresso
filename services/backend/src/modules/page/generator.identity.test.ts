import { describe, expect, it } from "vitest";
import type { z } from "zod";

import type { AiCallOptions, AiCallSpec, AiClient, AiResult } from "../../platform/ai/client.js";
import { AiPageGenerator, ungroundedEmails, type PageGenerationContext } from "./generator.js";

/**
 * 지면에 남의 신원이 들어가지 않는가.
 *
 * 2026-11-10 운영: 다른 사용자의 지면 끝 띠에 「이름 Minjae Park · Email libera3920@gmail.com」이 찍혔다. 서버
 * Claude Code CLI가 로그인 계정 이메일과 git 사용자 이름을 컨텍스트에 싣고, 프롬프트는 이름도 연락처도 주지
 * 않았다. 프롬프트가 작성자를 알리는지, 근거에 없는 이메일을 같은 대화에서 지우게 하는지 본다.
 */

const OPERATOR = "operator@example.com";

function context(evidence: string): PageGenerationContext {
  return {
    userId: null,
    author: { name: "오시건" },
    portfolioPlan: null,
    sections: [{ title: "소개", purpose: "누구인지", goal: "", points: [], targetLength: 200 }],
    evidence: [{ label: "기록", text: evidence }],
    media: [],
    jobTitle: null,
    company: null,
  };
}

/** 첫 출력에 검사를 돌려 보고, 받은 프롬프트와 위반을 남긴다. */
class CheckingAi implements AiClient {
  readonly streams = false;
  spec: AiCallSpec | undefined;
  violations: { path: string; problem: string }[] = [];
  constructor(private readonly html: string) {}

  async complete<T>(spec: AiCallSpec, schema: z.ZodType<T>, options: AiCallOptions<T> = {}): Promise<AiResult<T>> {
    this.spec = spec;
    const data = schema.parse({ html: this.html, css: "", rationale: "근거대로 썼다" });
    this.violations = (options.check?.(data) ?? []) as { path: string; problem: string }[];
    return {
      data,
      usage: { model: "stub", inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, costUsd: 0, durationMs: 0 },
    };
  }
}

describe("지면 작성자 신원", () => {
  it("프롬프트가 작성자 이름을 싣고 연락처를 두지 말라고 알린다", async () => {
    const ai = new CheckingAi("<main><h1>오시건</h1></main>");
    await new AiPageGenerator(ai).generate(context("백엔드를 만든다."));
    const prompt = ai.spec!.prompt;
    expect(prompt).toContain("## 누구의 지면");
    expect(prompt).toContain("이름: 오시건");
    expect(prompt).toContain("연락처(이메일 · 전화 · 개인 링크)는 받지 않았다");
  });

  it("근거에 없는 이메일은 그 줄을 지우라고 고쳐 받는다", async () => {
    const html = `<main><h1>오시건</h1><footer><dl><dt>Email</dt><dd>${OPERATOR}</dd></dl></footer></main>`;
    const ai = new CheckingAi(html);
    await new AiPageGenerator(ai).generate(context("백엔드를 만든다."));
    expect(ai.violations).toHaveLength(1);
    expect(ai.violations[0]!.path).toBe("/html");
    expect(ai.violations[0]!.problem).toContain(OPERATOR);
    expect(ai.violations[0]!.problem).toContain("지우고 다른 주소로 바꾸지 마세요");
  });

  it("근거에 사용자가 적은 이메일은 통과한다", async () => {
    const html = '<main><h1>오시건</h1><a href="mailto:Sigun@Example.com">sigun@example.com</a></main>';
    const ai = new CheckingAi(html);
    await new AiPageGenerator(ai).generate(context("연락은 sigun@example.com으로 받는다."));
    expect(ai.violations).toEqual([]);
  });
});

describe("ungroundedEmails", () => {
  it("화면 글자와 mailto 주소를 함께 보고 한 번씩 낸다", () => {
    const html = `<a href="mailto:${OPERATOR}?subject=hi">${OPERATOR}</a>`;
    expect(ungroundedEmails(html, "")).toEqual([OPERATOR]);
  });

  it("이메일이 없으면 비어 있다", () => {
    expect(ungroundedEmails("<p>3년 동안 결제 서버를 만들었다.</p>", "")).toEqual([]);
  });
});
