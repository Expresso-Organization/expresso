import { describe, expect, it, vi } from "vitest";

import { FormatRoutingPageGenerator } from "./format-router.js";
import type { PageGenerationContext, PageGenerator } from "./generator.js";

function setup(fallback: "html" | "json-render" = "json-render") {
  const html = { generate: vi.fn(async () => ({ kind: "html" })) } as unknown as PageGenerator & { generate: ReturnType<typeof vi.fn> };
  const structured = { generate: vi.fn(async () => ({ kind: "json-render" })) } as unknown as PageGenerator & { generate: ReturnType<typeof vi.fn> };
  const router = new FormatRoutingPageGenerator({ html, "json-render": structured }, fallback);
  return { router, html, structured };
}

const base = { userId: "user-1", sections: [], evidence: [], media: [] } as unknown as PageGenerationContext;

describe("지면 방식별 생성기 고르기", () => {
  it("생성 요청이 고른 방식을 먼저 따른다", async () => {
    const { router, html, structured } = setup("json-render");
    await router.generate({ ...base, pageFormat: "html" });
    expect(html.generate).toHaveBeenCalledOnce();
    expect(structured.generate).not.toHaveBeenCalled();
  });

  it("다시 뽑기면 직전 지면의 방식을 따른다 — 구조화 지면", () => {
    const { router } = setup("html");
    const previous = { html: "<main></main>", css: "", structured: {} } as unknown as PageGenerationContext["previous"];
    expect(router.formatFor({ ...base, previous })).toBe("json-render");
  });

  it("다시 뽑기면 직전 지면의 방식을 따른다 — 자유 지면", () => {
    const { router } = setup("json-render");
    expect(router.formatFor({ ...base, previous: { html: "<main></main>", css: "" } })).toBe("html");
  });

  it("고른 방식도 직전 지면도 없으면 설정 값을 쓴다", async () => {
    const { router, structured } = setup("json-render");
    const sink = { delta: vi.fn() } as never;
    await router.generate(base, sink);
    expect(structured.generate).toHaveBeenCalledWith(base, sink);
  });
});
