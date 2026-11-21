import { describe, expect, it } from "vitest";
import type { AgentMessage } from "@expresso/contracts";

import { fetchPublicPage, PublicPageError } from "../../platform/web/public-page.js";
import { LinkReadError, linksInMessages, normalizeLink, readLinkPage } from "./link-reader.js";

const at = "2026-11-21T00:00:00.000Z";
const user = (text: string): AgentMessage => ({ id: "00000000-0000-4000-8000-000000000001", role: "user", text, tools: [], createdAt: at });
const page = (body: string, contentType = "text/html; charset=utf-8", finalUrl = "https://github.com/me/moa") => async () => ({ body, finalUrl, contentType });
const readme = "모아는 Next.js와 Supabase로 만든 가계부입니다. 카드 내역을 불러와 지출을 분류하고, 달마다 예산을 넘으면 알려 줍니다.";

describe("대화에 적힌 링크", () => {
  it("문장에 붙은 문장부호 · 괄호 · 끝의 /를 떼고, 스킴이 없는 주소에는 https를 붙인다", () => {
    const links = linksInMessages([
      user("저장소는 https://github.com/me/moa/ 이고(배포는 https://moa.app.)"),
      user("발표 자료는 「www.slideshare.net/me/moa」에 있어요. github.com/me/api도요!"),
      { ...user("에이전트가 쓴 https://evil.example/steal"), role: "assistant" },
    ]);
    expect([...links].sort()).toEqual(["https://github.com/me/api", "https://github.com/me/moa", "https://moa.app/", "https://www.slideshare.net/me/moa"]);
  });
  it("같은 주소인지 정규화로 견준다 — 조각(#)은 버리고 쿼리는 지킨다", () => {
    expect(normalizeLink("https://github.com/me/moa#readme")).toBe("https://github.com/me/moa");
    expect(normalizeLink("https://example.com/post?id=1")).toBe("https://example.com/post?id=1");
    expect(normalizeLink("javascript:alert(1)")).toBeNull();
  });
});

describe("링크 페이지 읽기", () => {
  it("GitHub 저장소 페이지는 파일 목록(main)보다 긴 README(article)를 본문으로 읽는다", async () => {
    const html = `<html><head><title>me/moa: 모아 가계부</title><meta property="og:description" content="카드 내역 가계부"></head><body><nav>메뉴</nav>
      <main><div>src</div><div>package.json</div><article class="markdown-body"><h1>모아</h1><a href="/me/moa"><img src="logo.png" alt="로고 그림"></a>${`<p>${readme}</p>`.repeat(8)}</article></main></body></html>`;
    const read = await readLinkPage("https://github.com/me/moa", page(html));
    expect(read).toMatchObject({ url: "https://github.com/me/moa", title: "me/moa: 모아 가계부", description: "카드 내역 가계부", truncated: false });
    expect(read.text).toContain("Next.js와 Supabase로 만든 가계부");
    expect(read.text).not.toContain("메뉴");
    expect(read.text).not.toMatch(/로고 그림|\]\(|!\[/);
    expect(read.text).not.toContain("package.json");
  });
  it("글이 아닌 응답 · 읽을 글이 없는 페이지는 읽지 못했다고 돌려준다", async () => {
    await expect(readLinkPage("https://example.com/a.pdf", page("%PDF-1.5", "application/pdf"))).rejects.toThrow(LinkReadError);
    await expect(readLinkPage("https://example.com/app", page(`<html><body><div id="root"></div><script>app()</script></body></html>`))).rejects.toThrow("읽을 글이 거의 없습니다");
  });
  it("차단 · 사설 주소는 사유를 글로 돌려준다", async () => {
    await expect(readLinkPage("https://notion.so/x", async () => { throw new PublicPageError("blocked", 403); })).rejects.toThrow("읽기를 막았습니다");
    await expect(readLinkPage("http://127.0.0.1:4000/health", url => fetchPublicPage(url, { userAgent: "t", accept: "*/*", maxBytes: 10, timeoutMs: 1_000, maxRedirects: 0 }))).rejects.toThrow("내부 주소라 읽지 않습니다");
    await expect(readLinkPage("http://localhost/", url => fetchPublicPage(url, { userAgent: "t", accept: "*/*", maxBytes: 10, timeoutMs: 1_000, maxRedirects: 0 }))).rejects.toThrow("내부 주소라 읽지 않습니다");
  });
  it("긴 본문은 잘라서 잘랐다고 알린다", async () => {
    const read = await readLinkPage("https://example.com/post", page("가".repeat(20_000), "text/plain"));
    expect(read.text).toHaveLength(12_000);
    expect(read.truncated).toBe(true);
    expect(read.title).toBeNull();
  });
});
