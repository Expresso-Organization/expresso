import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  STRUCTURED_GROUP_TYPES,
  STRUCTURED_GROUP_VARIANTS,
  structuredModelSchema,
  type StructuredPortfolioContent,
} from "@expresso/contracts";
import {
  describeGroupRules,
  describeSpecSchema,
} from "./structured-spec-format.js";
import { structuredSpecPrompt } from "./structured-generator.js";
import { toToolSchema } from "../../platform/ai/client.js";

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
// 생성기와 같이 수집 원본 선택지를 비운 출력 스키마입니다.
const schema = structuredModelSchema(content, {
  intro: [],
  section: [],
  guidance: [],
});
type JsonObject = {
  properties: Record<string, JsonObject>;
  required?: string[];
};
const elements = (
  z.toJSONSchema(schema) as unknown as { properties: { elements: JsonObject } }
).properties.elements;

describe("출력 스키마에서 만든 형식 설명", () => {
  const format = describeSpecSchema(schema);
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
  it("선택 요소는 생략하라고 적고, 공급자 형식도 그 요소를 필수로 두지 않는다", () => {
    // 둘이 어긋나면 모델이 지시대로 뺀 출력을 공급자가 돌려보내 처음부터 다시 씁니다(2026-10-26 다듬기).
    const tool = toToolSchema(schema) as { properties: { elements: { required?: string[] } } };
    for (const key of format.optional) expect(tool.properties.elements.required ?? []).not.toContain(key);
    expect(format.text).toContain("(선택, 쓰지 않으면 생략)");
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
    // 모델은 design을 고르지 않습니다.
    expect(format.text).not.toContain("palette");
    expect(format.text).not.toContain("design");
  });
  it("이미지가 없는 사례에는 CaseGallery를 적지 않는다", () => {
    const gripper = format.text
      .split("\n")
      .find((line) => line.startsWith("elements.section-gripper"));
    expect(gripper).not.toContain("CaseGallery");
  });
  it("수집 원본 ID를 적지 않고 첫 화면 구도를 적는다", () => {
    expect(format.text).not.toContain("sourceId");
    expect(format.text).not.toContain("referenceIds");
    const intro = format.text.split("\n").find((line) => line.startsWith("elements.intro"));
    // route 사례에 이미지가 있어 이미지 중심 구도까지 고를 수 있습니다.
    expect(intro).toContain('variant: "statement"|"split"|"media"');
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
    const prompt = structuredSpecPrompt(content, { schema });
    expect(prompt).toContain(format.text);
    expect(prompt).not.toContain("수집 목록");
    expect(prompt).toContain(
      `사용할 요소 ID: ${JSON.stringify(format.required)}`,
    );
    expect(prompt).not.toContain("editorial(측면 소개+기사)");
  });
  it("직전 Spec은 모델이 내는 모양으로 보인다 — 받아들일 때 채운 페이지의 design · archetype은 뺀다", () => {
    const previous = {
      root: "page",
      elements: {
        page: { type: "PortfolioPage", props: { motion: "showcase", design: { layout: "library" }, archetype: "case-study" }, children: [] },
      },
    };
    const prompt = structuredSpecPrompt(content, { schema, previous });
    expect(prompt).toContain('직전 Spec: {"root":"page","elements":{"page":{"type":"PortfolioPage","props":{"motion":"showcase"},"children":[]}}}');
    // 저장한 Spec은 그대로입니다.
    expect(previous.elements.page.props).toHaveProperty("archetype", "case-study");
  });
  it("컨테이너를 쓸 수 없는 디자인이면 컨테이너 설명 없이 배치 문단을 넣는다", () => {
    const flat = structuredModelSchema(content, { intro: [], section: [], guidance: [], groups: [] });
    const prompt = structuredSpecPrompt(content, { schema: flat, layout: "고른 디자인은 가상이고 배치는 넓은 여백입니다." });
    expect(prompt).toContain("고른 디자인은 가상이고 배치는 넓은 여백입니다.");
    expect(prompt).not.toContain("컨테이너는 지면을 나누는 요소입니다");
    expect(prompt).not.toContain("Columns:");
    expect(prompt).not.toContain("variant='rail'로 Columns");
    expect(prompt).toContain("모든 요소를 page.children에 바로 둡니다");
    const withGroups = structuredSpecPrompt(content, { schema });
    expect(withGroups).toContain("컨테이너는 지면을 나누는 요소입니다");
    expect(withGroups).toContain("Columns:");
  });
});
