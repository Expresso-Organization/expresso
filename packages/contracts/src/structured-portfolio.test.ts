import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  applyStructuredTextPatches,
  EditStructuredPageSchema,
  StructuredMediaSchema,
  structuredModelSchema,
  structuredLeaves,
  validateStructuredPortfolio,
  type StructuredPortfolioContent,
} from "./structured-portfolio.js";

export const content: StructuredPortfolioContent = {
  version: 1,
  profile: {
    name: "가상 인물",
    role: "엔지니어",
    headline: "경로를 설계하는 엔지니어입니다.",
    intro: "입력 설명",
    focus: ["경로"],
  },
  sections: [
    {
      id: "project-a",
      title: "가상 경로",
      summary: "요약",
      body: "본문",
      pattern: "project",
      details: [
        { label: "문제", text: "막힌 경로" },
        { label: "작업", text: "우회 계획" },
      ],
      media: [],
      sourceIds: ["e-a"],
    },
  ],
  career: [],
  evidence: [
    {
      id: "e-a",
      title: "기록",
      kind: "시험",
      summary: "설명",
      body: "출처 본문",
    },
  ],
  contact: null,
};
export const spec = {
  root: "page",
  elements: {
    page: {
      type: "PortfolioPage",
      props: {
        profile: { $state: "/profile" },
        design: { layout: "dossier", palette: "sage", font: "sans" },
        motion: "showcase",
        rationale: "근거 중심",
      },
      children: ["intro", "evidence", "case-a"],
    },
    intro: {
      type: "NameIntro",
      props: { profile: { $state: "/profile" } },
      children: [],
    },
    evidence: {
      type: "EvidenceGrid",
      props: { evidence: { $state: "/evidence" } },
      children: [],
    },
    "case-a": {
      type: "CaseTechnical",
      props: { section: { $state: "/sectionById/project-a" } },
      children: [],
    },
  },
};
describe("구조화 포트폴리오 계약", () => {
  it("모델 출력 스키마에 위치별 튜플 문법을 포함하지 않는다", () => {
    const json = JSON.stringify(z.toJSONSchema(structuredModelSchema(content)));
    expect(json).not.toContain("prefixItems");
    expect(json).not.toContain('"items":false');
    // 컨테이너가 있으면 page.children 길이가 달라지므로 고정 길이 대신 상한을 둡니다.
    expect(json).toContain('"minItems":2');
    expect(json).toContain('"maxItems":8');
    expect(json).toContain('"group-1"');
    const reordered = structuredClone(spec);
    reordered.elements.page.children = ["evidence", "intro", "case-a"];
    expect(() => validateStructuredPortfolio(reordered, content)).toThrow(
      "첫 섹션",
    );
    const withContact = {
      ...spec,
      elements: {
        ...spec.elements,
        page: {
          ...spec.elements.page,
          children: ["intro", "contact", "evidence", "case-a"],
        },
        contact: {
          type: "Contact",
          props: { contact: { $state: "/contact" } },
          children: [],
        },
      },
    };
    expect(() =>
      validateStructuredPortfolio(withContact, {
        ...content,
        contact: { label: "연락", href: "mailto:fictional@example.com" },
      }),
    ).toThrow("마지막");
  });
  it("업로드 경로의 외부 URL과 경로 이탈을 거부한다", () => {
    const media = { alt: "업로드 이미지", origin: "uploaded" };
    expect(
      StructuredMediaSchema.safeParse({
        ...media,
        src: "/v1/media/4ddbf7b4-4372-40cc-b03d-10d7ab0bfa67?w=640",
      }).success,
    ).toBe(true);
    for (const src of [
      "https://other.test/image.png",
      "/v1/media/../../secret",
      "/v1/media/invalid",
      "/v1/media/4ddbf7b4-4372-40cc-b03d-10d7ab0bfa67/other",
    ])
      expect(StructuredMediaSchema.safeParse({ ...media, src }).success).toBe(
        false,
      );
  });
  it("근거를 사례 앞에 놓아도 원문 참조를 보존한다", () => {
    expect(
      validateStructuredPortfolio(spec, content).spec.elements.page?.children,
    ).toEqual(["intro", "evidence", "case-a"]);
  });
  it("누락·중복·임의 참조·연결되지 않은 요소를 거부한다", () => {
    const missing = structuredClone(spec);
    missing.elements.page.children.pop();
    const duplicate = structuredClone(spec);
    duplicate.elements.page.children.push("case-a");
    const path = structuredClone(spec);
    path.elements["case-a"].props.section.$state = "/profile";
    const disconnected = {
      ...spec,
      elements: { ...spec.elements, extra: spec.elements.intro },
    };
    for (const raw of [missing, duplicate, path, disconnected])
      expect(() => validateStructuredPortfolio(raw, content)).toThrow();
  });
  it("이미지가 없는 자료를 갤러리로 꾸미지 않는다", () => {
    const raw = structuredClone(spec);
    raw.elements["case-a"].type = "CaseGallery";
    expect(() => validateStructuredPortfolio(raw, content)).toThrow(
      "제공 이미지",
    );
  });
  it("문장 패치가 지정한 위치만 바꾸고 입력 원본은 보존한다", () => {
    const edit = EditStructuredPageSchema.parse({
      expectedRevision: 0,
      patches: [
        { path: "/sections/project-a/details/1/text", value: "새 우회 계획" },
      ],
    });
    const result = applyStructuredTextPatches(content, edit.patches);
    expect(result.sections[0]?.details[1]?.text).toBe("새 우회 계획");
    expect(content.sections[0]?.details[1]?.text).toBe("우회 계획");
    expect(result.sections[0]?.sourceIds).toEqual(["e-a"]);
    expect(() =>
      EditStructuredPageSchema.parse({
        expectedRevision: 0,
        patches: [
          {
            path: "/sections/project-a/media/0/src",
            value: "https://other.test",
          },
        ],
      }),
    ).toThrow();
  });
  describe("컨테이너 트리", () => {
    const content2 = {
      ...content,
      sections: [
        ...content.sections,
        { ...content.sections[0]!, id: "project-b", title: "가상 경로 2", sourceIds: [] },
      ],
      contact: { label: "연락", href: "mailto:fictional@example.com" },
    };
    const tree = () => ({
      root: "page",
      elements: {
        ...structuredClone(spec.elements),
        page: {
          ...structuredClone(spec.elements.page),
          children: ["intro", "group-1", "evidence", "contact"],
        },
        "group-1": {
          type: "Columns",
          props: { variant: "wide-start" },
          children: ["case-a", "case-b"],
        },
        "case-b": {
          type: "CaseEssay",
          props: { section: { $state: "/sectionById/project-b" } },
          children: [],
        },
        contact: {
          type: "Contact",
          props: { contact: { $state: "/contact" } },
          children: [],
        },
      } as Record<string, unknown>,
    });
    it("컨테이너 안의 사례를 한 번씩 연결한 트리를 받는다", () => {
      const result = validateStructuredPortfolio(tree(), content2);
      expect(structuredLeaves(result.spec).map((item) => [item.key, item.parent])).toEqual([
        ["intro", "page"],
        ["case-a", "group-1"],
        ["case-b", "group-1"],
        ["evidence", "page"],
        ["contact", "page"],
      ]);
      // 모델 계약도 같은 트리를 받습니다.
      const { "case-a": a, "case-b": b, ...rest } = tree().elements;
      const parsed = structuredModelSchema(content2).safeParse({
        root: "page",
        elements: {
          ...rest,
          intro: { ...spec.elements.intro, props: { profile: { $state: "/profile" }, sections: { $state: "/sections" } } },
          index: { type: "ProjectIndex", props: { sections: { $state: "/sections" }, variant: "rows" }, children: [] },
          "section-project-a": a,
          "section-project-b": b,
          "group-1": { type: "Columns", props: { variant: "even" }, children: ["section-project-a", "section-project-b"] },
          page: { ...spec.elements.page, children: ["intro", "index", "group-1", "evidence", "contact"] },
        },
      });
      expect(parsed.error?.issues ?? []).toEqual([]);
    });
    it("컨테이너 규칙을 어긴 트리를 거부한다", () => {
      const cases: [string, (raw: ReturnType<typeof tree>) => void, string][] = [
        ["중첩", (raw) => { raw.elements["group-2"] = { type: "Band", props: { variant: "panel" }, children: ["case-b"] }; (raw.elements["group-1"] as { children: string[] }).children = ["case-a", "group-2"]; }, "넣을 수 없는"],
        ["소개를 컨테이너에", (raw) => { (raw.elements.page as { children: string[] }).children = ["group-1", "evidence", "contact"]; (raw.elements["group-1"] as { children: string[] }).children = ["intro", "case-a"]; raw.elements["group-3"] = { type: "Band", props: { variant: "panel" }, children: ["case-b"] }; (raw.elements.page as { children: string[] }).children.splice(1, 0, "group-3"); }, "넣을 수 없는"],
        ["연락처를 컨테이너에", (raw) => { (raw.elements.page as { children: string[] }).children = ["intro", "group-1", "evidence"]; raw.elements["group-1"] = { type: "Grid", props: { variant: "even" }, children: ["case-a", "case-b", "contact"] }; }, "넣을 수 없는"],
        ["중복", (raw) => { (raw.elements.page as { children: string[] }).children.splice(2, 0, "case-a"); }, "중복 ID: case-a"],
        ["연결되지 않은 컨테이너", (raw) => { raw.elements["group-2"] = { type: "Band", props: { variant: "panel" }, children: ["case-b"] }; }, "누락 ID: group-2"],
        ["자식 수", (raw) => { (raw.elements["group-1"] as { children: string[] }).children = ["case-a"]; (raw.elements.page as { children: string[] }).children.splice(2, 0, "case-b"); }, "2개"],
        ["variant 짝", (raw) => { (raw.elements["group-1"] as { props: { variant: string } }).props.variant = "panel"; }, "variant"],
      ];
      for (const [name, change, message] of cases) {
        const raw = tree();
        change(raw);
        expect(() => validateStructuredPortfolio(raw, content2), name).toThrow(message);
      }
    });
  });
});
