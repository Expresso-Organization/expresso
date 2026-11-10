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
  checkElementEdit,
  elementChanges,
  elementGuide,
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

  it("비워서 지운 칸도 바뀐 곳으로 센다", () => {
    const dated = validateStructuredPortfolio(snapshot.spec, { ...content, sections: [{ ...content.sections[0]!, period: "2024" }] });
    const next = applyElementEdit(dated, "section-a", { text: [{ path: "/sections/a/period", value: "" }] }, design);
    expect(next.content.sections[0]?.period).toBeUndefined();
    expect(elementChanges(dated, next, "section-a")).toEqual([expect.objectContaining({ before: "2024", after: "" })]);
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

describe("에이전트의 요소 고침", () => {
  it("읽을 설명에 선택지 · 글자 부분 · 고칠 수 있는 글 경로를 싣고, 이름은 빼고, 고칠 수 없는 요소는 null이다", () => {
    const guide = elementGuide(snapshot, "section-a", design)!;
    expect(guide).toMatchObject({ key: "section-a", type: "CaseEssay", title: "경로 재설계" });
    expect(guide.options.find((option) => option.name === "scale")?.choices.map((choice) => choice.value)).toContain("lead");
    expect(guide.parts.map((part) => part.part)).toContain("title");
    expect(guide.text).toContainEqual({ path: "/sections/a/summary", label: "요약", value: "야간 배치를 24분으로 줄였습니다" });
    expect(elementGuide(snapshot, "intro", design)!.text.map((row) => row.path)).not.toContain("/profile/name");
    expect(elementGuide(snapshot, "page", design)).toBeNull();
    expect(elementGuide(snapshot, "missing", design)).toBeNull();
  });

  it("통과한 고침은 새 스냅샷과 바뀐 곳을 낸다", () => {
    const result = checkElementEdit(snapshot, "section-a", { props: [{ name: "scale", value: "lead" }], style: [{ part: "title", color: "accent" }], text: [{ path: "/sections/a/summary", value: "배치를 24분으로" }] }, design);
    expect(result.issues).toEqual([]);
    if (!("snapshot" in result)) throw new Error("통과해야 합니다.");
    expect(result.snapshot.content.sections[0]?.summary).toBe("배치를 24분으로");
    expect(result.changes.map((row) => row.label)).toEqual(["크기", "제목 모양", "요약"]);
  });

  it("근거 없는 숫자 · 없는 선택지 · 남의 경로 · 이름은 저장하지 않고 고칠 방법과 허용 값을 돌려준다", () => {
    const { issues } = checkElementEdit(snapshot, "section-a", {
      props: [{ name: "scale", value: "huge" }],
      style: [{ part: "title", color: "neon", size: "giant" }],
      text: [{ path: "/sections/a/summary", value: "배치를 99분 줄였습니다" }, { path: "/profile/name", value: "다른 이름" }],
    }, design);
    expect(issues).toEqual([
      expect.stringContaining("고를 수 있는 값"),
      expect.stringContaining("고를 수 있는 색"),
      expect.stringContaining("고를 수 있는 단계"),
      expect.stringContaining("출처에 없는 숫자"),
      expect.stringContaining("고칠 수 있는 경로"),
    ]);
  });

  it("지면 규칙을 어긴 고침과 바뀐 곳이 없는 고침도 문장으로 돌려준다", () => {
    // 인용을 비우면 큰 인용 요소가 그릴 글이 없어집니다.
    expect(checkElementEdit(snapshot, "quote-1", { text: [{ path: "/sections/a/quote", value: "" }] }, design).issues).toHaveLength(1);
    expect(checkElementEdit(snapshot, "quote-1", { text: [{ path: "/sections/a/quote", value: "막히면 돌아갑니다." }] }, design).issues).toEqual([expect.stringContaining("바뀐 곳이 없습니다")]);
    expect(checkElementEdit(snapshot, "page", {}, design).issues).toEqual([expect.stringContaining("outline")]);
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
