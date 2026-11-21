import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { DesignGraphicSchema, PAGE_MOTION_CSS, PAGE_SHELL_CSS, pagePolicyPrompt, PAGE_EFFECT_CATALOG, PAGE_EFFECT_RUNTIME, PAGE_EFFECTS, PAGE_SCRIPT_LIBRARY, PAGE_SCRIPT_PROMPT, PAGE_SCRIPT_POLICY_MARK, joinPageScripts, pageDocument, pageEffectPrompt, pageScriptText, sha256Base64 } from "./index.js";

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

  it("부르는 효과만 런타임과 함께 저자 모듈보다 앞에 싣고, 해시를 정책에 넣는다 — 모르는 이름은 싣지 않는다", () => {
    const document = pageDocument({ ...base, script: 'ExpressoEffects.mount("fog", { el }); ExpressoEffects.mount(\'blueprint\', {}); ExpressoEffects.mount("nope", {})', run: { origin: "" } });
    const runtime = pageScriptText(PAGE_EFFECT_RUNTIME), fog = pageScriptText(PAGE_EFFECTS.fog!);
    expect(document.indexOf(runtime)).toBeGreaterThan(-1);
    expect(document.indexOf(runtime)).toBeLessThan(document.indexOf(fog));
    expect(document.indexOf(fog)).toBeLessThan(document.indexOf('ExpressoEffects.mount("fog"'));
    expect(document).toContain(pageScriptText(PAGE_EFFECTS.blueprint!));
    expect(document).not.toContain(pageScriptText(PAGE_EFFECTS.net!));
    expect(document).toContain(`'sha256-${node(fog)}'`);
    // MIT 고지가 묶음과 함께 실린다.
    expect(document).toContain("Vanta.js 0.5.24 · Copyright 2020 Teng Bao · MIT License");
    expect(pageDocument({ ...base, script: "draw()", run: { origin: "" } })).not.toContain("ExpressoEffects =");
  });

  it("효과는 사용자가 고른 것만 — 지침은 canvas 2D이고 목록이 없으며, 고른 효과 하나의 쓰는 법만 따로 낸다", () => {
    expect(PAGE_EFFECT_CATALOG.map((effect) => effect.name)).toEqual(["net", "dots", "fog", "blueprint"]);
    for (const gone of ["MotionWeb", "metaballs", "globe", "ExpressoEffects", "`net`", "`dots`"]) expect(PAGE_SCRIPT_PROMPT).not.toContain(gone);
    expect(PAGE_SCRIPT_PROMPT).toContain("그림은 canvas 2D로 직접 짓는다");
    const dots = pageEffectPrompt("dots");
    expect(dots).toContain('ExpressoEffects.mount("dots"');
    for (const other of ["net", "fog", "blueprint"]) expect(dots).not.toContain(`"${other}"`);
    expect(pageEffectPrompt("nope")).toBe("");
    // 앞판의 차원 값(2d · 3d)은 기본 그림으로 읽는다.
    expect(DesignGraphicSchema.parse("3d")).toBe("canvas");
    expect(DesignGraphicSchema.parse("blueprint")).toBe("blueprint");
    expect(() => DesignGraphicSchema.parse("cells")).toThrow();
    expect(pageDocument({ ...base, script: "await MotionWeb.create({})", run: { origin: "" } })).not.toContain("MOTIONWEB_WGSL_STD");
  });

  it("스크립트가 없어도 돌리는 자리면 정책을 싣는다 — 함께 넣는 우리 스크립트만 돈다", () => {
    const document = pageDocument({ ...base, run: { origin: "", extraScripts: ["edit()"] } });
    expect(document).not.toContain('<script type="module">');
    expect(document).toContain(`'sha256-${node("edit()")}'`);
    expect(document).toContain("img-src data: blob:");
  });

  it("등장(`data-motion`)은 지면 껍데기에 실리고, 스크롤 등장의 투명한 시작은 지원 확인 · 움직임 줄이기 안에서만 선언한다", () => {
    expect(PAGE_SHELL_CSS).toContain(PAGE_MOTION_CSS);
    const supports = PAGE_MOTION_CSS.indexOf("@supports (animation-timeline:view())");
    const reduced = PAGE_MOTION_CSS.indexOf("@media (prefers-reduced-motion:no-preference)");
    expect(reduced).toBeGreaterThan(-1);
    // 스크롤 등장 규칙(view())은 모두 @supports 뒤에 있다 — 모르는 브라우저에서 내용이 첫 프레임(투명)에 멈추지 않게.
    expect(PAGE_MOTION_CSS.indexOf("animation-timeline:view()", supports + 40)).toBeGreaterThan(supports);
    expect(PAGE_MOTION_CSS.slice(0, supports)).not.toContain("animation-timeline");
    // 측정 · 축소 미리보기(<html data-reveal="none">)에서는 모두 꺼진다.
    for (const line of PAGE_MOTION_CSS.split("\n").filter((row) => row.includes("data-motion"))) expect(line).toContain(':root:not([data-reveal="none"])');
    expect(pagePolicyPrompt({ script: true })).toContain("## 움직임 — 등장은 `data-motion`으로");
    expect(pagePolicyPrompt()).not.toContain("data-motion");
  });
});
