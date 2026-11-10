import type { PageGenerationFormat } from "@expresso/contracts";

import type { GeneratedPageResult, PageGenerationContext, PageGenerator, PageStreamSink } from "./generator.js";

/**
 * 지면 방식(`json-render` · `html`)에 맞는 생성기로 보낸다.
 *
 * 방식은 생성마다 고른다 — 같은 공고 · 같은 디자인으로 구조화 생성과 자유 생성을 나란히 만들어 견주기
 * 위해서다. 고르는 순서는 셋이다.
 *
 * 1. 생성 요청이 고른 방식(`context.pageFormat`)
 * 2. 다시 뽑기면 직전 지면의 방식 — 구조화 지면은 `previous.structured`를 싣고, 자유 지면은 싣지 않는다
 * 3. 서버 설정(`PAGE_GENERATION_FORMAT`)
 *
 * 2를 두는 이유: 자유 생성으로 만든 포트폴리오를 설정 값으로 다시 뽑으면 구조화 지면으로 바뀌어 비교가 깨진다.
 */
export class FormatRoutingPageGenerator implements PageGenerator {
  constructor(
    private readonly generators: Record<PageGenerationFormat, PageGenerator>,
    private readonly fallback: PageGenerationFormat,
  ) {}

  formatFor(context: PageGenerationContext): PageGenerationFormat {
    if (context.pageFormat) return context.pageFormat;
    if (context.previous) return context.previous.structured ? "json-render" : "html";
    return this.fallback;
  }

  generate(context: PageGenerationContext, sink?: PageStreamSink | null): Promise<GeneratedPageResult> {
    return this.generators[this.formatFor(context)].generate(context, sink);
  }
}
