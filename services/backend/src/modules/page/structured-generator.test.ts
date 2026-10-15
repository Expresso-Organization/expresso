import { retrievePageLibrary } from "@expresso/portfolio-renderer";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  validateStructuredPortfolio,
  PageGenerationManifestSchema,
  type StructuredPortfolioContent,
} from "@expresso/contracts";
import {
  AiError,
  type AiClient,
  type AiCallSpec,
} from "../../platform/ai/client.js";
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
const { contact: _contact, ...modelContent } = content;
const choices = retrievePageLibrary(content);
const spec = {
  root: "page",
  elements: {
    page: {
      type: "PortfolioPage",
      props: {
        profile: { $state: "/profile" },
        design: { layout: "library", palette: "sage", font: "sans" },
        motion: "showcase",
        referenceIds: [],
        rationale: "경로 설명을 읽는 목차와 상세 구성",
      },
      children: ["intro", "index", "section-project-a"],
    },
    intro: {
      type: "NameIntro",
      props: {
        profile: { $state: "/profile" },
        sections: { $state: "/sections" },
        sourceId: choices.intro[0]!.renderKey!,
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
      props: {
        section: { $state: "/sectionById/project-a" },
        sourceId: choices.section.find((i) => i.sourceItemId === "card")!
          .renderKey!,
      },
      children: [],
    },
  },
};
/** 실제 어댑터처럼 출력이 스키마에 맞지 않으면 AI_INVALID_OUTPUT을 던집니다. Error를 넣으면 그대로 던집니다. */
class Stub implements AiClient {
  calls: AiCallSpec[] = [];
  schemas: z.ZodType[] = [];
  constructor(private outputs: unknown[]) {}
  async complete<T>(request: AiCallSpec, schema: z.ZodType<T>) {
    this.calls.push(request);
    this.schemas.push(schema);
    const output = this.outputs.shift();
    if (output instanceof Error) throw output;
    const parsed = schema.safeParse(output);
    if (!parsed.success)
      throw new AiError(
        "AI_INVALID_OUTPUT",
        request.contract,
        `structured output did not match the schema: ${parsed.error.message}`,
      );
    return {
      data: parsed.data,
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
    const ai = new Stub([modelContent, spec]);
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
  const rawInput = (() => {
    const { structuredContent: _content, ...raw } = context;
    return {
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
    };
  })();

  it("내용 정리에서 이름이나 섹션을 두 번 연속 바꾸면 중단한다", async () => {
    const changed = structuredClone(modelContent);
    changed.profile.name = "다른 이름";
    const ai = new Stub([changed, changed]);
    await expect(
      new StructuredPageGenerator(ai).generate(rawInput),
    ).rejects.toThrow(
      /내용 정리 결과가 계약 검사를 통과하지 못했습니다: 이름\(가상 민수\)/,
    );
    expect(ai.calls).toHaveLength(2);
  });

  it("내용 정리 모델에게 연락처를 묻지 않고, 생성 결과의 연락처는 비어 있다", async () => {
    const ai = new Stub([modelContent, spec]);
    const result = await new StructuredPageGenerator(ai).generate(rawInput);
    const schema = z.toJSONSchema(ai.schemas[0]!) as {
      properties: Record<string, unknown>;
    };
    expect(Object.keys(schema.properties)).not.toContain("contact");
    expect(ai.calls[0]!.system).not.toContain("contact");
    expect(result.manifest.structured?.content.contact).toBeNull();
  });

  it("소개 문장 규칙을 어기면 오류와 직전 출력을 붙여 다시 요청하고, 사용량을 합산한다", async () => {
    const broken = structuredClone(modelContent);
    broken.profile.headline = "경로를 설계합니다. 시험도 합니다.";
    const ai = new Stub([broken, modelContent, spec]);
    const result = await new StructuredPageGenerator(ai).generate(rawInput);
    expect(ai.calls).toHaveLength(3);
    expect(ai.calls[1]!.prompt).toContain("검사 오류: profile.headline:");
    expect(ai.calls[1]!.prompt).toContain("경로를 설계합니다. 시험도 합니다.");
    expect(result.manifest.structured?.content.profile.headline).toBe(
      content.profile.headline,
    );
    expect(result.manifest.usage.outputTokens).toBe(60);
  });

  it("공급자 스키마 위반도 다시 요청하고, 연결 오류는 다시 요청하지 않는다", async () => {
    const missing = structuredClone(modelContent) as Partial<
      typeof modelContent
    >;
    delete missing.career;
    const retried = new Stub([missing, modelContent, spec]);
    await new StructuredPageGenerator(retried).generate(rawInput);
    expect(retried.calls).toHaveLength(3);
    expect(retried.calls[1]!.prompt).toContain(
      "검사 오류: structured output did not match the schema",
    );

    const unavailable = new Stub([
      new AiError("AI_UNAVAILABLE", "page_generation", "claude exited with 1"),
    ]);
    await expect(
      new StructuredPageGenerator(unavailable).generate(rawInput),
    ).rejects.toThrow("claude exited with 1");
    expect(unavailable.calls).toHaveLength(1);
  });
});
