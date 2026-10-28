import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DesignSystemSpecV2Schema,
  validateStructuredPortfolio,
  type StructuredPortfolioContent,
} from "@expresso/contracts";

import { ScriptedAiClient } from "../../platform/ai/scripted-client.js";
import {
  PageElementEditor,
  applyElementEdit,
  elementChanges,
  elementTextPaths,
  markdownToText,
  recordInsertIndex,
  recordSectionByRule,
} from "./element-edit.js";

const designs = JSON.parse(readFileSync(new URL("../../../../../packages/portfolio-renderer/src/fixtures/designs.json", import.meta.url), "utf8"));
const design = DesignSystemSpecV2Schema.parse(designs.clarity);
const step = design.typography.scale.at(-1)!.name;

const content: StructuredPortfolioContent = {
  version: 1,
  profile: { name: "가상 인물", role: "엔지니어", headline: "경로를 설계합니다.", intro: "소개", focus: [] },
  sections: [
    {
      id: "a",
      title: "경로 재설계",
      summary: "야간 배치를 24분으로 줄였습니다",
      body: "본문",
      pattern: "project",
      details: [{ label: "문제", text: "3시간 걸리던 배치" }],
      media: [],
      sourceIds: [],
      quote: "막히면 돌아갑니다.",
    },
  ],
  career: [],
  evidence: [],
  contact: null,
};
const snapshot = validateStructuredPortfolio(
  {
    root: "page",
    elements: {
      page: {
        type: "PortfolioPage",
        props: { profile: { $state: "/profile" }, design: { layout: "editorial" }, motion: "subtle", rationale: "근거" },
        children: ["intro", "section-a", "quote-1"],
      },
      intro: { type: "NameIntro", props: { profile: { $state: "/profile" }, variant: "statement" }, children: [] },
      "section-a": { type: "CaseEssay", props: { section: { $state: "/sectionById/a" } }, children: [] },
      "quote-1": { type: "PullQuote", props: { section: { $state: "/sectionById/a" } }, children: [] },
    },
  },
  content,
);

describe("요소 하나 고치기", () => {
  it("요소가 보여 주는 글의 경로만 낸다", () => {
    expect(elementTextPaths(snapshot, "quote-1")).toEqual(["/sections/a/quote"]);
    expect(elementTextPaths(snapshot, "intro")).toEqual(["/profile/name", "/profile/role", "/profile/headline", "/profile/intro"]);
    expect(elementTextPaths(snapshot, "section-a")).toContain("/sections/a/details/0/text");
  });

  it("선택지 · 글자 모양 · 글을 적용하고 바뀐 곳만 줄로 낸다", () => {
    const next = applyElementEdit(snapshot, "section-a", {
      props: { scale: "lead" },
      style: { title: { color: "accent", size: step } },
      text: [{ path: "/sections/a/title", value: "경로 다시 짜기" }],
    }, design);
    expect(next.spec.elements["intro"]).toEqual(snapshot.spec.elements["intro"]);
    expect(elementChanges(snapshot, next, "section-a")).toEqual([
      { label: "크기", before: "기본", after: "크게" },
      { label: "제목 모양", before: "기본", after: `강조색 · ${step}` },
      { label: "제목", before: "경로 재설계", after: "경로 다시 짜기" },
    ]);
  });

  it("카탈로그에 없는 선택지 · 디자인에 없는 단계 · 없는 부분은 받지 않는다", () => {
    expect(() => applyElementEdit(snapshot, "section-a", { props: { scale: "huge" } }, design)).toThrow("'huge'");
    expect(() => applyElementEdit(snapshot, "section-a", { style: { title: { size: "giant" } } }, design)).toThrow("단계");
    expect(() => applyElementEdit(snapshot, "quote-1", { style: { title: { color: "accent" } } }, design)).toThrow("부분");
    expect(() => applyElementEdit(snapshot, "page", { props: {} }, design)).toThrow("요소");
  });
});

describe("요소 지시 AI", () => {
  it("근거 없는 숫자를 쓴 칸만 같은 대화에서 고쳐 받는다", async () => {
    const ai = new ScriptedAiClient(
      () => ({ note: "요약을 줄였습니다.", text: [{ path: "/sections/a/summary", value: "배치를 99분 줄였습니다" }] }),
      (_request, paths) => paths.map((path) => ({ path, value: "배치를 24분으로 줄였습니다" })),
    );
    const result = await new PageElementEditor(ai).instruct({ userId: "u1", snapshot, key: "section-a", instruction: "요약을 짧게", design });
    expect(ai.calls).toHaveLength(1);
    expect(ai.calls[0]!.contract).toBe("partial_edit");
    expect(ai.fixRequests.map((request) => request.paths)).toEqual([["/text/0/value"]]);
    expect(result.edit.text).toEqual([{ path: "/sections/a/summary", value: "배치를 24분으로 줄였습니다" }]);
    expect(result.note).toBe("요약을 줄였습니다.");
  });

  it("지면 규칙을 어긴 고침은 그 칸을 고쳐 받는다", async () => {
    // 인용을 비우면 큰 인용 요소가 그릴 글이 없어집니다.
    const ai = new ScriptedAiClient(
      () => ({ note: "인용을 지웠습니다.", text: [{ path: "/sections/a/quote", value: "" }] }),
      () => [{ path: "/text", value: [{ path: "/sections/a/quote", value: "돌아가도 닿습니다." }] }],
    );
    const result = await new PageElementEditor(ai).instruct({ userId: "u1", snapshot, key: "quote-1", instruction: "인용 바꿔", design });
    expect(ai.fixRequests).toHaveLength(1);
    expect(result.edit.text).toEqual([{ path: "/sections/a/quote", value: "돌아가도 닿습니다." }]);
  });
});

describe("기록으로 사례 쓰기", () => {
  it("AI가 없으면 기록 제목과 본문을 그대로 쓴다", () => {
    const text = markdownToText("# 제목\n\n**배치**를 [다시](https://a.test) 짰습니다. 둘째 문장.\n\n- 항목");
    expect(text).toBe("제목\n\n배치를 다시 짰습니다. 둘째 문장.\n\n항목");
    const section = recordSectionByRule({ id: "8f9c8a2e-1111-4a5b-9c3d-123456789abc", title: "배치 재설계", text });
    expect(section).toMatchObject({ title: "배치 재설계", summary: "제목", body: text, pattern: "project", sourceIds: ["8f9c8a2e-1111-4a5b-9c3d-123456789abc"] });
  });

  it("칸 길이와 근거를 넘은 칸만 고쳐 받는다", async () => {
    const ai = new ScriptedAiClient(
      () => ({ title: "배치 재설계", summary: "요약", body: "본문", details: [], metrics: [{ label: "소요", value: "5분" }], quote: "", steps: [] }),
      () => [{ path: "/metrics", value: [{ label: "소요", value: "24분" }] }],
    );
    const { section } = await new PageElementEditor(ai).writeSection({ userId: "u1", id: "r1", title: "배치", text: "야간 배치를 24분으로 줄였다." });
    expect(ai.calls[0]!.contract).toBe("page_fill");
    expect(ai.fixRequests).toHaveLength(1);
    expect(section.metrics).toEqual([{ label: "소요", value: "24분" }]);
    expect(section).not.toHaveProperty("quote");
  });
});

describe("기록 사례를 넣을 자리", () => {
  const node = (type: string, children: string[] = []) => ({ type, props: {}, children });
  const spec = (children: string[], extra: Record<string, ReturnType<typeof node>> = {}) => ({
    root: "page",
    elements: { page: node("PortfolioPage", children), intro: node("NameIntro"), a: node("CaseEssay"), career: node("CareerTimeline"), evidence: node("EvidenceGrid"), contact: node("Contact"), ...extra },
  }) as never;

  it("사례 뒤, 경력 · 근거 자료 · 연락처 앞에 둔다", () => {
    expect(recordInsertIndex(spec(["intro", "a", "career", "evidence", "contact"]))).toBe(2);
    expect(recordInsertIndex(spec(["intro", "a"]))).toBe(2);
  });

  it("보조 요소만 담은 묶음도 보조 요소로 본다", () => {
    expect(recordInsertIndex(spec(["intro", "a", "group-1"], { "group-1": node("Columns", ["career", "evidence"]) }))).toBe(2);
    expect(recordInsertIndex(spec(["intro", "group-1", "contact"], { "group-1": node("Columns", ["a", "career"]) }))).toBe(2);
  });
});
