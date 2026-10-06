import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  validateStructuredPortfolio,
  PageGenerationManifestSchema,
  type StructuredPortfolioContent,
} from "@expresso/contracts";
import type { AiClient, AiCallSpec } from "../../platform/ai/client.js";
import { StructuredPageGenerator } from "./structured-generator.js";
import type { PageGenerationContext } from "./generator.js";

const content: StructuredPortfolioContent = {
  version: 1,
  profile: {
    name: "가상 민수",
    role: "엔지니어",
    headline: "경로를 설계하는 엔지니어입니다.",
    intro: "설명",
    focus: ["경로"],
  },
  sections: [
    {
      id: "project-a",
      title: "경로",
      summary: "시험",
      body: "원문",
      pattern: "project",
      details: [],
      media: [],
      sourceIds: [],
    },
  ],
  evidence: [],
  career: [],
  contact: null,
};
const spec = {
  root: "page",
  elements: {
    page: {
      type: "PortfolioPage",
      props: {
        profile: { $state: "/profile" },
        design: { layout: "dossier", palette: "sage", font: "sans" },
        motion: "showcase",
        rationale: "경로 설명을 읽는 목차와 상세 구성",
      },
      children: ["intro", "index", "section-project-a"],
    },
    intro: {
      type: "NameIntro",
      props: {
        profile: { $state: "/profile" },
        sections: { $state: "/sections" },
      },
      children: [],
    },
    index: {
      type: "ProjectIndex",
      props: { sections: { $state: "/sections" }, variant: "rail" },
      children: [],
    },
    "section-project-a": {
      type: "CaseTechnical",
      props: { section: { $state: "/sectionById/project-a" } },
      children: [],
    },
  },
};
class Stub implements AiClient {
  calls: AiCallSpec[] = [];
  constructor(private outputs: unknown[]) {}
  async complete<T>(request: AiCallSpec, schema: z.ZodType<T>) {
    this.calls.push(request);
    return {
      data: schema.parse(this.outputs.shift()),
      usage: {
        model: "local-test",
        inputTokens: 10,
        outputTokens: 20,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        durationMs: 1,
        costUsd: null,
      },
    };
  }
}
const context: PageGenerationContext = {
  structuredContent: content,
  portfolioPlan: null,
  sections: [],
  evidence: [],
  media: [],
  jobTitle: null,
  company: null,
};
describe("모델 기반 구조화 생성", () => {
  it("선택 자료를 내용 계약으로 정리한 뒤 Spec 생성으로 이어간다", async () => {
    const ai = new Stub([content, spec]);
    const { structuredContent: _content, ...raw } = context;
    const result = await new StructuredPageGenerator(ai).generate({
      ...raw,
      author: { name: content.profile.name },
      sections: [
        {
          id: "project-a",
          title: "경로",
          purpose: "시험",
          goal: "",
          points: [],
          targetLength: 100,
        },
      ],
    });
    expect(ai.calls).toHaveLength(2);
    expect(result.manifest.structured?.content).toEqual(content);
    expect(result.manifest.usage.outputTokens).toBe(40);
  });
  it("모델 Spec 원문을 저장하고 기존 html/css 스트림과 연결한다", async () => {
    const ai = new Stub([spec]),
      deltas: string[] = [];
    const result = await new StructuredPageGenerator(ai).generate(context, {
      delta: (text) => deltas.push(text),
      thinking: () => {},
    });
    expect(result.manifest.structured?.spec).toEqual(spec);
    expect(PageGenerationManifestSchema.parse(result.manifest)).toEqual(
      result.manifest,
    );
    expect(result.html).toContain("원문");
    expect(JSON.parse(deltas[0]!).html).toBe(result.html);
    expect(
      validateStructuredPortfolio(result.manifest.structured!.spec, content)
        .content,
    ).toEqual(content);
  });
  it("중복 섹션을 거절한 뒤 모델의 수정된 Spec만 렌더링한다", async () => {
    const broken = structuredClone(spec);
    broken.elements.page.children[2] = "index";
    const ai = new Stub([broken, spec]);
    const result = await new StructuredPageGenerator(ai).generate(context);
    expect(ai.calls).toHaveLength(2);
    expect(result.manifest.repairCount).toBe(1);
    expect(result.manifest.usage.outputTokens).toBe(40);
  });
  it("내용 정리에서 이름과 선택한 섹션을 변경하면 중단한다", async () => {
    const changed = structuredClone(content);
    changed.profile.name = "다른 이름";
    const ai = new Stub([changed]);
    const { structuredContent: _content, ...raw } = context;
    await expect(
      new StructuredPageGenerator(ai).generate({
        ...raw,
        author: { name: "가상 민수" },
        sections: [
          {
            id: "project-a",
            title: "경로",
            purpose: "시험",
            goal: "",
            points: [],
            targetLength: 100,
          },
        ],
      }),
    ).rejects.toThrow("이름이나 입력 섹션");
  });
});
