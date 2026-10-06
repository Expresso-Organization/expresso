import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  applyStructuredTextPatches,
  EditStructuredPageSchema,
  StructuredMediaSchema,
  structuredModelSchema,
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
    expect(json).toContain('"minItems":4');
    expect(json).toContain('"maxItems":4');
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
});
