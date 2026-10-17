import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  STRUCTURED_GROUP_TYPES,
  STRUCTURED_GROUP_VARIANTS,
  structuredModelSchema,
  type StructuredPortfolioContent,
} from "@expresso/contracts";
import { retrievePageLibrary } from "@expresso/portfolio-renderer";
import {
  describeGroupRules,
  describeSpecSchema,
} from "./structured-spec-format.js";
import {
  libraryChoices,
  structuredSpecPrompt,
} from "./structured-generator.js";

const content: StructuredPortfolioContent = {
  version: 1,
  profile: {
    name: "가상 민수",
    role: "로봇 엔지니어",
    headline: "순찰 로봇의 경로를 설계합니다.",
    intro: "설명",
    focus: [],
  },
  sections: [
    {
      id: "route",
      title: "경로 계획",
      summary: "요약",
      body: "본문",
      pattern: "project",
      details: [],
      media: [
        {
          src: "data:image/png;base64,iVBORw0KGgo=",
          alt: "가상 도면",
          origin: "fictional",
        },
      ],
      sourceIds: ["log"],
    },
    {
      id: "gripper",
      title: "그리퍼",
      summary: "요약",
      body: "본문",
      pattern: "project",
      details: [],
      media: [],
      sourceIds: [],
    },
  ],
  career: [
    {
      id: "c1",
      period: "2024",
      organization: "가상 회사",
      role: "엔지니어",
      description: "설명",
    },
  ],
  evidence: [
    {
      id: "log",
      title: "경로 기록",
      kind: "문서",
      summary: "요약",
      body: "본문",
    },
  ],
  contact: { label: "메일", href: "mailto:a@example.com" },
};
const library = retrievePageLibrary(content);
const choices = libraryChoices(library);
const schema = structuredModelSchema(content, {
  ...choices,
  layout: "library",
});
type JsonObject = {
  properties: Record<string, JsonObject>;
  required?: string[];
};
const elements = (
  z.toJSONSchema(schema) as unknown as { properties: { elements: JsonObject } }
).properties.elements;

describe("출력 스키마에서 만든 형식 설명", () => {
  const format = describeSpecSchema(schema, [
    { values: choices.intro, label: "intro 선택지 ID" },
  ]);
  it("요소 ID 집합이 출력 스키마의 elements 키와 같다", () => {
    expect(new Set([...format.required, ...format.optional, "page"])).toEqual(
      new Set(Object.keys(elements.properties)),
    );
    expect(format.optional).toEqual([
      "group-1",
      "group-2",
      "group-3",
      "group-4",
    ]);
  });
  it("요소마다 스키마의 props 키와 고정 참조를 모두 적는다", () => {
    for (const [key, node] of Object.entries(elements.properties)) {
      // 줄 머리(콜론 앞)에 적힌 요소 ID로 찾습니다. 묶인 컨테이너는 "elements.group-1, group-2"처럼 적힙니다.
      const line = format.text.split("\n").find((item) =>
        item
          .slice(0, item.indexOf(": "))
          .replace(/^elements\./, "")
          .split(/, | \(/)
          .includes(key),
      );
      expect(line, key).toBeDefined();
      for (const prop of Object.keys(node.properties["props"]!.properties))
        expect(line, `${key}.${prop}`).toContain(`${prop}`);
    }
    expect(format.text).toContain('section: {$state: "/sectionById/route"}');
    expect(format.text).toContain('layout: "library"');
  });
  it("이미지가 없는 사례에는 CaseGallery를 적지 않는다", () => {
    const gripper = format.text
      .split("\n")
      .find((line) => line.startsWith("elements.section-gripper"));
    expect(gripper).not.toContain("CaseGallery");
  });
  it("이름을 붙인 선택지 enum은 ID 목록 대신 이름으로 적는다", () => {
    expect(format.text).toContain("sourceId: <intro 선택지 ID>");
    expect(format.text).not.toContain(JSON.stringify(choices.intro[0]));
  });
  it("컨테이너 규칙을 계약 상수에서 만든다", () => {
    const rules = describeGroupRules();
    for (const type of STRUCTURED_GROUP_TYPES)
      expect(rules).toContain(`${type}는 자식`);
    expect(rules).toContain(
      `variant ${STRUCTURED_GROUP_VARIANTS.Columns.join("|")}`,
    );
  });
  it("프롬프트의 요소 ID 목록과 형식 설명이 생성기에 넘기는 스키마와 같다", () => {
    const prompt = structuredSpecPrompt(content, "", null, library, schema);
    const full = describeSpecSchema(schema, [
      { values: choices.intro, label: "intro 선택지 ID" },
      { values: choices.section, label: "section 선택지 ID" },
      { values: choices.guidance, label: "guidance 선택지 ID" },
    ]);
    expect(prompt).toContain(full.text);
    expect(prompt).toContain(
      `사용할 요소 ID: ${JSON.stringify(format.required)}`,
    );
    expect(prompt).not.toContain("editorial(측면 소개+기사)");
  });
});
