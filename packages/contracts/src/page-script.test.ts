import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { PAGE_SCRIPT_LIBRARY, PAGE_SCRIPT_POLICY_MARK, joinPageScripts, pageDocument, pageScriptText, sha256Base64 } from "./index.js";

const base = { html: "<main><canvas width=\"10\" height=\"10\"></canvas></main>", css: "main{}", title: "지면" };
const node = (text: string) => createHash("sha256").update(text).digest("base64");

describe("지면 스크립트", () => {
  it("해시는 Node의 SHA-256과 같다 — 한글 · 빈 글 · 블록 경계 길이까지", () => {
    for (const text of ["", "a", "그림을 그린다", "x".repeat(55), "x".repeat(56), "x".repeat(64), "y".repeat(1000)]) expect(sha256Base64(text)).toBe(node(text));
  });

  it("원문의 </script와 <!--는 요소를 닫거나 파서를 옮기지 못하게 바꾼다", () => {
    expect(pageScriptText('const a = "</script><img src=x>"; // <!-- x')).toBe('const a = "<\\/script><img src=x>"; // <\\!-- x');
    expect(pageScriptText("a</SCRIPT>")).toBe("a<\\/SCRIPT>");
  });

  it("돌리는 자리가 아니면 스크립트도 정책도 싣지 않는다 — 지금의 문서와 같다", () => {
    expect(pageDocument({ ...base, script: "alert(1)" })).toBe(pageDocument(base));
    expect(pageDocument(base)).not.toContain("<script");
  });

  it("돌리는 자리면 import map · 모듈 스크립트와 그 해시만 연 정책을 싣는다", () => {
    const document = pageDocument({ ...base, script: "draw()</script>", run: { origin: "https://expresso.test", extraScripts: ["track()"] } });
    const code = "draw()<\\/script>";
    const importMap = JSON.stringify({ imports: { three: PAGE_SCRIPT_LIBRARY.url } });
    expect(document).toContain(`<script type="module">${code}</script>`);
    expect(document).toContain(`<script type="importmap">${importMap}</script>`);
    const policy = document.match(new RegExp(`${PAGE_SCRIPT_POLICY_MARK} content="([^"]+)"`))![1]!;
    expect(policy).toContain(`script-src 'sha256-${node(importMap)}' 'sha256-${node(code)}' 'sha256-${node("track()")}' ${PAGE_SCRIPT_LIBRARY.url}`);
    expect(policy).toContain("default-src 'none'");
    expect(policy).toContain("connect-src 'none'");
    expect(policy).toContain("img-src https://expresso.test data: blob:");
    expect(policy).not.toContain("unsafe-eval");
    // 정책은 다른 무엇보다 먼저 읽혀야 한다 — 머리의 서체 링크보다 앞이다.
    expect(document.indexOf(PAGE_SCRIPT_POLICY_MARK)).toBeLessThan(document.indexOf("<link"));
  });

  it("첫 화면과 이어 쓴 지면의 스크립트는 모듈을 따로 둔다 — 같은 import를 두 번 적어도 서로를 멈추지 않는다", () => {
    const script = joinPageScripts('import * as THREE from "three"; a()', "", '  import * as THREE from "three"; b()  ')!;
    const document = pageDocument({ ...base, script, run: { origin: "" } });
    expect(document.match(/<script type="module">/g)).toHaveLength(2);
    expect(document).toContain(`'sha256-${node('import * as THREE from "three"; b()')}'`);
    expect(joinPageScripts(undefined, " ")).toBeUndefined();
  });

  it("스크립트가 없어도 돌리는 자리면 정책을 싣는다 — 함께 넣는 우리 스크립트만 돈다", () => {
    const document = pageDocument({ ...base, run: { origin: "", extraScripts: ["edit()"] } });
    expect(document).not.toContain('<script type="module">');
    expect(document).toContain(`'sha256-${node("edit()")}'`);
    expect(document).toContain("img-src data: blob:");
  });
});
