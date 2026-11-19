import { describe, expect, it } from "vitest";
import type { DesignChatMessage, DesignLayoutSpec, DesignSnippet } from "@expresso/contracts";

import { catalogEntries } from "../../design-systems/catalog.js";
import type { BrewPageSources } from "../brew-sources.js";
import { seedPrompt } from "../briefed-generator.js";
import { catalogStyle, drawCall, openingCall, replyCall, reviseCall, transcript, type Opening } from "./prompts.js";

const sources: BrewPageSources = {
  brewId: "b1",
  author: { name: "윤하린" },
  portfolioPlan: null,
  sections: [{ id: "s1", title: "성능 개선", purpose: "수치로 보인다", goal: "", points: [], targetLength: 300 }],
  evidence: [{ id: "r1", label: "상품 상세", text: "LCP를 3.8초에서 1.9초로 줄였다." }],
  jobTitle: "프론트엔드 개발자",
  company: null,
  records: [],
};
const tokens = { background: "#ffffff", text: "#111111", accent: "#d6336c", font: "sans" as const, density: "comfortable" as const };
const head = { role: "프론트엔드 개발자", headline: "느린 화면을 재서 고칩니다.", intro: "", subject: "상품 상세", lead: ["LCP 3.8초 → 1.9초"] };
const style = { name: "측정판", words: "성능 리포트의 회색과 파랑", tokens };
const layout: DesignLayoutSpec = {
  name: "전후 비교",
  words: "상품 상세의 전후 비교 차트",
  blocks: [{ kind: "title", x: 0, y: 0, w: 6, h: 2 }, { kind: "figure", x: 6, y: 1, w: 10, h: 6 }, { kind: "text", x: 0, y: 3, w: 5, h: 3 }, { kind: "accent", x: 0, y: 7, w: 4, h: 2 }],
};
const opening: Opening = { head, say: "안녕하세요! 상품 상세를 3.8초에서 1.9초로 줄인 일이 눈에 띄네요. 어떤 느낌으로 보여 드릴까요?", styles: [style], layouts: [layout] };
const stamp = "2026-11-19T00:00:00.000Z";
const snippet: DesignSnippet = { id: "00000000-0000-4000-8000-000000000001", origin: "agent", name: "측정판 리포트", note: "", words: style.words, tokens, layout, css: ".hero{}", html: '<header class="hero"></header>', fromSnippetId: null, createdAt: stamp };
const reply = { say: "분홍으로 가 볼게요.", show: "none" as const, styles: [], layouts: [], screens: [], instruction: "" };

describe("디자인 대화의 호출", () => {
  it("여는 말과 답하는 호출은 말 · 제안 · 사실의 Do와 Do not을 읽고, 스타일과 레이아웃을 따로 내라는 말을 받는다", () => {
    for (const system of [openingCall("u1", sources).spec.system, replyCall({ userId: "u1", sources, head, messages: [], snippets: [], text: "더 밝게", subject: null, selected: null, latest: null }).spec.system]) {
      for (const title of ["## 말 —", "## 제안 — 스타일과 레이아웃을 따로 냅니다", "## 사실"]) expect(system).toContain(title);
      expect(system.match(/### Do\n/g)).toHaveLength(3);
      expect(system.match(/### Do not\n/g)).toHaveLength(3);
      expect(system).toContain("`styles`와 `layouts`를 서로 독립된 목록으로 냅니다.");
      expect(system).toContain("보고서 문장으로 시작하지 않습니다");
      expect(system).toContain("문단과 목록으로 화면을 채우는 레이아웃을 내지 않습니다.");
      expect(system).toContain("같은 블록을 같은 자리에 둔 레이아웃을 둘 이상 내지 않습니다");
      // 조사를 근거로 넣었던 문서형 · 작업물 목록형 짜임은 없다.
      for (const gone of ["문서형", "작업물 목록형", "`document`", "가장 앞세울 사실 하나를 짚고"]) expect(system).not.toContain(gone);
    }
  });

  it("네 호출 모두 Sonnet으로 부른다 — 계약의 기본 등급은 Opus다", () => {
    const calls = [
      openingCall("u1", sources),
      replyCall({ userId: "u1", sources, head, messages: [], snippets: [], text: "더 밝게", subject: null, selected: null, latest: null }),
      drawCall({ userId: "u1", sources, style, layout }),
      reviseCall({ userId: "u1", sources, snippet, instruction: "강조색을 초록으로" }),
    ];
    expect(calls.map(({ spec }) => spec.modelTier)).toEqual(["sonnet", "sonnet", "sonnet", "sonnet"]);
    expect(calls.map(({ spec }) => spec.contract)).toEqual(["page_design", "page_design", "page_generation", "page_generation"]);
  });

  it("여는 호출은 원문을 읽고, 출처에 없는 숫자 · 빈 목록 · 긴 설명 · 격자를 벗어난 배치도를 걸러 낸다", () => {
    const call = openingCall("u1", sources);
    expect(call.spec.prompt).toContain("LCP를 3.8초에서 1.9초로 줄였다.");
    expect(call.spec.prompt).toContain("이름: 윤하린");
    expect(call.check(opening)).toEqual([]);
    const paths = call.check({ ...opening, head: { ...head, lead: ["전환율 42% 상승"] }, say: "전환율 42%가 눈에 띄네요.", styles: [], layouts: [] }).map(({ path }) => path);
    expect(paths).toEqual(["/head/lead", "/say", "/styles", "/layouts"]);
    // 대화 계약이 받는 길이를 넘는 이름은 저장되기 전에 그 칸만 고쳐 받는다.
    expect(call.check({ ...opening, styles: [{ ...style, name: "가".repeat(121) }] }).map(({ path }) => path)).toEqual(["/styles/0/name"]);
    // 견본 아래의 글은 한 줄이다. 색이나 배치를 다시 풀어 쓴 긴 설명은 그 칸만 고쳐 받는다.
    const wordy = call.check({ ...opening, layouts: [{ ...layout, words: "이름 옆에 LCP 3.8초 → 1.9초를 크게 세우고 그 아래에 성능·디자인 시스템·접근성 앵커를 둡니다." }] });
    expect(wordy.map(({ path }) => path)).toEqual(["/layouts/0/words"]);
    expect(wordy[0]?.problem).toContain("한 줄");
    // 배치도는 견본이 그대로 그리고 그리는 호출도 그대로 받는다. 격자를 벗어난 블록은 그 블록만 고쳐 받는다.
    const off = call.check({ ...opening, layouts: [{ ...layout, blocks: [layout.blocks[0]!, { kind: "figure", x: 10, y: 1, w: 10, h: 6 }, { kind: "text", x: 0, y: 3.5, w: 5, h: 3 }] }] });
    expect(off.map(({ path }) => path)).toEqual(["/layouts/0/blocks/1", "/layouts/0/blocks/2"]);
    expect(call.check({ ...opening, layouts: [{ ...layout, blocks: [] }] }).map(({ path }) => path)).toEqual(["/layouts/0/blocks"]);
  });

  it("건네는 말은 끝까지 쓴 문장이고 세 문장을 넘지 않는다", () => {
    const call = openingCall("u1", sources);
    const problems = (say: string) => call.check({ ...opening, say }).map(({ path, problem }) => `${path} ${problem}`);
    expect(problems("상품 상세 LCP를 3.8초에서 1.9초로 줄인 일을 앞에")[0]).toContain("끝나지 않았습니다");
    expect(problems("안녕하세요. 자료 잘 읽었어요. 상품 상세가 눈에 띄네요. 어떤 느낌이 좋을까요?")[0]).toContain("4문장");
    // 숫자 안의 점은 문장의 끝이 아니다.
    expect(problems("상품 상세를 3.8초에서 1.9초로 줄이셨네요. 어떤 느낌으로 보여 드릴까요?")).toEqual([]);
  });

  it("그리는 호출은 원문 자료와 따로 고른 스타일 · 레이아웃, 디자인의 Do와 Do not을 받는다", () => {
    const { spec, check } = drawCall({ userId: "u1", sources, style, layout });
    expect(spec.prompt).toContain("LCP를 3.8초에서 1.9초로 줄였다.");
    expect(spec.prompt).toContain("## 사용자가 고른 스타일 — 색 · 서체 · 밀도는 그대로 따른다");
    expect(spec.prompt).toContain("강조 `#d6336c`");
    // 레이아웃은 견본이 그린 배치도와 같은 값으로 간다.
    expect(spec.prompt).toContain("## 사용자가 고른 레이아웃 — 구성은 이것을 따른다");
    expect(spec.prompt).toContain("고른 것: **전후 비교** — 상품 상세의 전후 비교 차트");
    expect(spec.prompt).toContain("- 이 사람의 일로 그리는 그림: 왼쪽에서 6칸 · 위에서 1칸 자리에 가로 10칸 · 세로 6칸");
    for (const line of ["## Do\n", "## Do not\n", "포트폴리오를 디자인한다.", "이 사람의 일을 그림으로 만든다.", "문서나 이력서처럼 보이면 실패다.", "같은 모양의 카드를 줄지어 쌓지 않는다."]) expect(spec.prompt).toContain(line);
    // 문서를 흉내 내라던 지시는 없다.
    for (const gone of ["제품을 파는 랜딩 페이지가 아니라", "글이 화면의 주인", "## 짜임", "`composition`"]) expect(spec.prompt).not.toContain(gone);
    // 레이아웃이 정해지지 않았으면(카탈로그의 디자인만 고름) 구성을 그리는 쪽이 정한다.
    const open = drawCall({ userId: "u1", sources, style, layout: null }).spec.prompt;
    expect(open).toContain("## 레이아웃 — 정해지지 않았다. 구성은 네가 정한다");
    expect(open).not.toContain("배치도");
    expect(spec.prompt).toContain("지면 전체를 감싸는 틀");
    expect(spec.system).toContain("## 디자인 지침");
    expect(spec.system).not.toContain("`plan`");
    const draft = { name: "가", note: "전후 비교를 가장 크게 세웠어요.", tokens, css: "", html: "<header><h1>윤하린</h1></header>" };
    expect(check(draft)).toEqual([]);
    expect(check({ ...draft, html: "첫 화면을 설명합니다" }).map(({ path }) => path)).toEqual(["/html"]);
    expect(check({ ...draft, html: '<header><a href="mailto:ops@example.com">연락</a></header>' })[0]?.problem).toContain("ops@example.com");
    expect(check({ ...draft, name: "가".repeat(121) }).map(({ path }) => path)).toEqual(["/name"]);
    // 한 장을 그리면 `note`가 에이전트의 말로 대화에 놓인다. 끊긴 문장은 그 칸만 고쳐 받는다.
    expect(check({ ...draft, note: "전후 비교를 가장 크게" }).map(({ path }) => path)).toEqual(["/note"]);
    // 배치를 풀어 쓴 긴 말은 화면에 보이는 것을 글로 다시 설명한 것이다. 그 칸만 고쳐 받는다.
    const wordy = check({ ...draft, note: "상품 상세의 전후 비교 막대를 화면 가운데에 가장 크게 세우고, 그 옆에 접근성 위반 건수와 번들 크기의 전후를 작은 막대로 받쳤어요." });
    expect(wordy.map(({ path }) => path)).toEqual(["/note"]);
    expect(wordy[0]?.problem).toContain("주인공");
    // 소독기가 거절하는 CSS는 저장 단계에서 실패하게 두지 않고, 그 칸만 고쳐 받는다.
    const imported = check({ ...draft, css: '@import url("https://fonts.example/round.css");.hero{}' });
    expect(imported.map(({ path }) => path)).toEqual(["/css"]);
    expect(imported[0]?.problem).toContain("@import");
  });

  it("고른 첫 화면 뒤를 잇는 지면도 같은 디자인의 Do와 Do not을 받는다", () => {
    const prompt = seedPrompt({ name: "측정판 리포트", words: style.words, tokens, html: snippet.html, css: snippet.css }).join("\n");
    for (const line of ["## Do\n", "## Do not\n", "섹션마다 주인공을 하나 세우고", "문서나 이력서처럼 보이면 실패다."]) expect(prompt).toContain(line);
    expect(prompt).not.toContain("나머지 섹션 · 경력 · 근거를 잇는다");
  });

  it("답하는 호출은 대화와 대상을 글로 받고, 대상 없는 고치기와 빈 띄우기를 걸러 낸다", () => {
    const ids = [2, 3, 4, 5, 6, 7].map((n) => `00000000-0000-4000-8000-00000000000${n}`);
    const messages: DesignChatMessage[] = [
      { id: ids[0]!, role: "assistant", text: opening.say, status: "complete", card: { kind: "proposals", styles: [{ id: ids[1]!, ...style }], layouts: [{ id: ids[2]!, ...layout }] }, createdAt: stamp },
      { id: ids[3]!, role: "user", action: "draw", text: "", subjects: [{ kind: "style", id: ids[1]!, name: "측정판" }, { kind: "layout", id: ids[2]!, name: "전후 비교" }], createdAt: stamp },
      { id: ids[4]!, role: "assistant", text: "", status: "complete", card: { kind: "screens", items: [{ id: ids[5]!, name: "측정판", words: style.words, tokens, layout, status: "done", snippetId: snippet.id }] }, createdAt: stamp },
    ];
    const blocks = JSON.stringify(layout.blocks);
    expect(transcript(messages, [snippet])).toEqual([
      `디자이너: ${opening.say}`,
      "  [스타일 견본 「측정판」 — 성능 리포트의 회색과 파랑 (바탕 #ffffff · 글자 #111111 · 강조 #d6336c · 고딕 · 읽기 편하게)]",
      `  [레이아웃 견본 — 레이아웃 「전후 비교」 — 상품 상세의 전후 비교 차트 · 배치도 ${blocks}]`,
      "사용자: (견본에서 스타일과 레이아웃을 골라 첫 화면을 청함) [대상: 스타일 「측정판」 · 레이아웃 「전후 비교」]",
      `  [첫 화면 「측정판 리포트」 — 스타일 「측정판」 성능 리포트의 회색과 파랑 (바탕 #ffffff · 글자 #111111 · 강조 #d6336c · 고딕 · 읽기 편하게) · 레이아웃 「전후 비교」 — 상품 상세의 전후 비교 차트 · 배치도 ${blocks}]`,
    ]);
    const input = { userId: "u1", sources, head, messages, snippets: [snippet], text: "강조색을 초록으로", selected: snippet, latest: snippet };
    const targeted = replyCall({ ...input, subject: { kind: "snippet", snippet } });
    expect(targeted.spec.prompt).toContain("## 이 말의 대상\n첫 화면 「측정판 리포트」");
    expect(targeted.spec.prompt).toContain("사용자가 지금 고른 첫 화면: 「측정판 리포트」");
    // 마크업은 답하는 호출에 싣지 않는다. 무엇을 띄울지 정하는 데는 이름과 값이면 된다.
    expect(targeted.spec.prompt).not.toContain(snippet.html);
    const revision = { ...reply, say: "초록으로 바꿔 볼게요.", show: "revision" as const, instruction: "강조색을 초록으로" };
    expect(targeted.check(revision)).toEqual([]);
    expect(targeted.check({ ...revision, instruction: " " }).map(({ path }) => path)).toEqual(["/instruction"]);
    // 대상을 붙이지 않고 고쳐 달라고 하면 가장 최근에 그린 첫 화면을 고친다.
    const loose = replyCall({ ...input, subject: null });
    expect(loose.spec.prompt).toContain("사용자가 대상을 붙이지 않았습니다. 고쳐 달라는 말이면 가장 최근에 그린 첫 화면 「측정판 리포트」을 고칩니다");
    expect(loose.check(revision)).toEqual([]);
    // 그린 첫 화면이 하나도 없으면 고칠 수 없다. 띄울 것과 함께 고치겠다는 말도 고쳐 받는다.
    expect(replyCall({ ...input, subject: null, latest: null }).check(revision).map(({ path }) => path)).toEqual(["/show", "/say"]);
    expect(loose.check({ ...reply, show: "screens" }).map(({ path }) => path)).toEqual(["/screens"]);
    expect(loose.check({ ...reply, show: "proposals" }).map(({ path }) => path)).toEqual(["/styles"]);
    // 견본은 한쪽만 새로 낼 수 있다 — 색 이야기에는 스타일만.
    expect(loose.check({ ...reply, show: "proposals", styles: [style] })).toEqual([]);
    expect(loose.check({ ...reply, show: "screens", screens: [{ source: "user", style, layout }] })).toEqual([]);
    // 첫 화면으로 그릴 짝의 배치도도 같은 검사를 지난다. 경로는 짝 안의 칸을 가리킨다.
    expect(loose.check({ ...reply, show: "screens", screens: [{ source: "user", style, layout: { ...layout, blocks: [{ kind: "figure", x: 12, y: 0, w: 8, h: 4 }] } }] }).map(({ path }) => path)).toEqual(["/screens/0/layout/blocks/0"]);
    expect(loose.check(reply)).toEqual([]);
  });

  it("카탈로그의 디자인 판을 그 판으로 생성할 때와 같은 색 · 서체의 스타일로 옮긴다", () => {
    const revision = catalogEntries()[0]!.revision;
    const found = catalogStyle(revision.revisionId)!;
    expect(found.name).toBe(revision.spec.identity.name);
    expect(found.tokens.background).toMatch(/^#[0-9a-f]{6}$/i);
    // 카탈로그의 디자인은 구성을 정하지 않는다.
    expect(found).not.toHaveProperty("layout");
    expect(catalogStyle("00000000-0000-4000-8000-00000000ffff")).toBeNull();
  });
});
