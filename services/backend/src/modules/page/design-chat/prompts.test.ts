import { describe, expect, it } from "vitest";
import type { DesignChatMessage, DesignSnippet } from "@expresso/contracts";

import { catalogEntries } from "../../design-systems/catalog.js";
import type { BrewPageSources } from "../brew-sources.js";
import { catalogDirection, drawCall, openingCall, replyCall, reviseCall, transcript, type Opening } from "./prompts.js";

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
const opening: Opening = { head, say: "LCP 3.8초 → 1.9초를 앞에 세우겠습니다.", directions: [{ name: "측정판", words: "밝은 회색에 파랑", tokens, composition: "document" }] };
const stamp = "2026-11-19T00:00:00.000Z";
const snippet: DesignSnippet = { id: "00000000-0000-4000-8000-000000000001", origin: "agent", name: "측정판 리포트", note: "", words: "밝은 회색에 파랑", tokens, composition: "document", css: ".hero{}", html: '<header class="hero"></header>', fromSnippetId: null, createdAt: stamp };

describe("디자인 대화의 호출", () => {
  it("여는 말과 답하는 호출은 네 짜임과 저마다 맞는 때를 읽고, 방향마다 짜임을 다르게 잡으라는 말을 받는다", () => {
    for (const system of [openingCall("u1", sources).spec.system, replyCall({ userId: "u1", sources, head, messages: [], snippets: [], text: "더 밝게", subject: null, selected: null }).spec.system]) {
      for (const key of ["`document`", "`work`", "`cover`", "`metric`"]) expect(system).toContain(key);
      expect(system).toContain("짜임을 서로 다르게 잡습니다");
    }
  });

  it("네 호출 모두 Sonnet으로 부른다 — 계약의 기본 등급은 Opus다", () => {
    const calls = [
      openingCall("u1", sources),
      replyCall({ userId: "u1", sources, head, messages: [], snippets: [], text: "더 밝게", subject: null, selected: null }),
      drawCall({ userId: "u1", sources, direction: opening.directions[0]! }),
      reviseCall({ userId: "u1", sources, snippet, instruction: "강조색을 초록으로" }),
    ];
    expect(calls.map(({ spec }) => spec.modelTier)).toEqual(["sonnet", "sonnet", "sonnet", "sonnet"]);
    expect(calls.map(({ spec }) => spec.contract)).toEqual(["page_design", "page_design", "page_generation", "page_generation"]);
  });

  it("여는 호출은 원문을 읽고, 출처에 없는 숫자와 빈 방향을 걸러 낸다", () => {
    const call = openingCall("u1", sources);
    expect(call.spec.prompt).toContain("LCP를 3.8초에서 1.9초로 줄였다.");
    expect(call.spec.prompt).toContain("이름: 윤하린");
    expect(call.check(opening)).toEqual([]);
    const paths = call.check({ ...opening, head: { ...head, lead: ["전환율 42% 상승"] }, say: "전환율 42%를 앞에 세우겠습니다.", directions: [] }).map(({ path }) => path);
    expect(paths).toEqual(["/head/lead", "/say", "/directions"]);
    // 대화 계약이 받는 길이를 넘는 이름은 저장되기 전에 그 칸만 고쳐 받는다.
    expect(call.check({ ...opening, directions: [{ ...opening.directions[0]!, name: "가".repeat(121) }] }).map(({ path }) => path)).toEqual(["/directions/0/name"]);
  });

  it("그리는 호출은 원문 자료와 방향의 색 · 서체 · 짜임을 받고, 계획 칸을 요구하지 않는다", () => {
    const { spec, check } = drawCall({ userId: "u1", sources, direction: opening.directions[0]! });
    // 문서형과 작업물 목록형은 경력 · 프로젝트 목록을 첫 화면에 쓴다. 뽑아 둔 사실 몇 줄이 아니라 원문을 받는다.
    expect(spec.prompt).toContain("LCP를 3.8초에서 1.9초로 줄였다.");
    expect(spec.prompt).toContain("## 짜임 — 소개 글과 목록으로 시작하는 문서");
    expect(spec.prompt).not.toContain("## 짜임 — 대표 수치를 세운 첫 화면");
    expect(spec.prompt).toContain("제품을 파는 랜딩 페이지가 아니라");
    // 짜임이 정해지지 않은 방향(카탈로그의 디자인)은 넷을 모두 보이고 그리는 쪽이 고른다.
    const open = drawCall({ userId: "u1", sources, direction: { ...opening.directions[0]!, composition: null } }).spec.prompt;
    for (const name of ["문서형", "작업물 목록형", "표지형", "수치 중심"]) expect(open).toContain(name);
    expect(open).toContain("고른 것을 `composition`에 적는다");
    expect(spec.prompt).toContain("강조 `#d6336c`");
    expect(spec.prompt).toContain("지면 전체를 감싸는 틀");
    expect(spec.system).toContain("## 디자인 지침");
    expect(spec.system).not.toContain("`plan`");
    expect(check({ name: "가", note: "나", tokens, composition: "document", css: "", html: "첫 화면을 설명합니다" }).map(({ path }) => path)).toEqual(["/html"]);
    expect(check({ name: "가", note: "나", tokens, composition: "document", css: "", html: '<header><a href="mailto:ops@example.com">연락</a></header>' })[0]?.problem).toContain("ops@example.com");
    expect(check({ name: "가", note: "나", tokens, composition: "document", css: "", html: "<header><h1>윤하린</h1></header>" })).toEqual([]);
    // 소독기가 거절하는 CSS는 저장 단계에서 실패하게 두지 않고, 그 칸만 고쳐 받는다.
    expect(check({ name: "가".repeat(121), note: "나", tokens, composition: "document", css: "", html: "<header><h1>윤하린</h1></header>" }).map(({ path }) => path)).toEqual(["/name"]);
    const imported = check({ name: "가", note: "나", tokens, composition: "document", css: '@import url("https://fonts.example/round.css");.hero{}', html: "<header><h1>윤하린</h1></header>" });
    expect(imported.map(({ path }) => path)).toEqual(["/css"]);
    expect(imported[0]?.problem).toContain("@import");
  });

  it("답하는 호출은 대화와 대상을 글로 받고, 대상 없는 고치기와 방향 없는 띄우기를 걸러 낸다", () => {
    const messages: DesignChatMessage[] = [
      { id: "00000000-0000-4000-8000-000000000002", role: "assistant", text: opening.say, status: "complete", card: { kind: "directions", directions: [{ id: "00000000-0000-4000-8000-000000000003", ...opening.directions[0]! }] }, createdAt: stamp },
      { id: "00000000-0000-4000-8000-000000000004", role: "user", action: "draw", text: "", subjects: [{ kind: "direction", id: "00000000-0000-4000-8000-000000000003", name: "측정판" }], createdAt: stamp },
      { id: "00000000-0000-4000-8000-000000000005", role: "assistant", text: "", status: "complete", card: { kind: "screens", items: [{ id: "00000000-0000-4000-8000-000000000006", name: "측정판", words: "밝은 회색에 파랑", tokens, composition: "document", status: "done", snippetId: snippet.id }] }, createdAt: stamp },
    ];
    expect(transcript(messages, [snippet])).toEqual([
      `디자이너: ${opening.say}`,
      "  [견본 「측정판」 — 밝은 회색에 파랑 (문서형 · 바탕 #ffffff · 글자 #111111 · 강조 #d6336c · 고딕 · 읽기 편하게)]",
      "사용자: (견본을 눌러 첫 화면을 청함) [대상: 견본 「측정판」]",
      "  [첫 화면 「측정판 리포트」 — 밝은 회색에 파랑 (문서형 · 바탕 #ffffff · 글자 #111111 · 강조 #d6336c · 고딕 · 읽기 편하게)]",
    ]);
    const input = { userId: "u1", sources, head, messages, snippets: [snippet], text: "강조색을 초록으로", selected: snippet };
    const targeted = replyCall({ ...input, subject: { kind: "snippet", snippet } });
    expect(targeted.spec.prompt).toContain("## 이 말의 대상\n첫 화면 「측정판 리포트」");
    expect(targeted.spec.prompt).toContain("사용자가 지금 고른 첫 화면: 「측정판 리포트」");
    // 마크업은 답하는 호출에 싣지 않는다. 무엇을 띄울지 정하는 데는 이름과 값이면 된다.
    expect(targeted.spec.prompt).not.toContain(snippet.html);
    const revision = { say: "고치겠습니다.", show: "revision" as const, directions: [], instruction: "강조색을 초록으로" };
    expect(targeted.check(revision)).toEqual([]);
    expect(targeted.check({ ...revision, instruction: " " }).map(({ path }) => path)).toEqual(["/instruction"]);
    const loose = replyCall({ ...input, subject: null });
    expect(loose.check(revision).map(({ path }) => path)).toEqual(["/show"]);
    expect(loose.check({ say: "보여 드릴게요.", show: "screens", directions: [], instruction: "" }).map(({ path }) => path)).toEqual(["/directions"]);
    expect(loose.check({ say: "어떤 색이 좋으세요?", show: "none", directions: [], instruction: "" })).toEqual([]);
  });

  it("카탈로그의 디자인 판을 그 판으로 생성할 때와 같은 색 · 서체의 방향으로 옮긴다", () => {
    const revision = catalogEntries()[0]!.revision;
    const direction = catalogDirection(revision.revisionId)!;
    expect(direction.name).toBe(revision.spec.identity.name);
    expect(direction.tokens.background).toMatch(/^#[0-9a-f]{6}$/i);
    expect(direction.composition).toBeNull();
    expect(catalogDirection("00000000-0000-4000-8000-00000000ffff")).toBeNull();
  });
});
