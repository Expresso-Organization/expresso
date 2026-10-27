import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  validateStructuredPortfolio,
  PageGenerationManifestSchema,
  type StructuredPortfolioContent,
} from "@expresso/contracts";
import {
  AiError,
  type AiCallOptions,
  type AiClient,
  type AiCallSpec,
} from "../../platform/ai/client.js";
import { runWithFixes, valueAt } from "../../platform/ai/fixes.js";
import { StructuredPageGenerator } from "./structured-generator.js";
import { PageRenderError, type PageGenerationContext } from "./generator.js";
import { findPortfolioDesign } from "../design-systems/index.js";
import { describeArchetype, describeDesignLayout, designLayout, renderedContentValues, type RenderMeasurement } from "@expresso/portfolio-renderer";
import type { PageMeasurer, PageMeasurement, PageScreenshot } from "../../platform/browser/page-measurer.js";

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
const spec = {
  root: "page",
  elements: {
    page: {
      type: "PortfolioPage",
      props: {
        profile: { $state: "/profile" },
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
        variant: "statement",
        backdrop: "grid",
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
      },
      children: [],
    },
  },
};
/** 생성기가 검사 전에 채우는 저장 계약의 배치 이름과 유형입니다. 문맥에 사용자 스타일이 없으면 library, 유형이 없으면 case-study입니다. */
function stored<T>(value: T): T {
  const copy = structuredClone(value) as { elements: { page: { props: object } } };
  copy.elements.page.props = { ...copy.elements.page.props, design: { layout: "library" }, archetype: "case-study" };
  return copy as T;
}
/**
 * 실제 어댑터와 같은 검사 · 고치기 순서(`runWithFixes`)로 도는 가짜 공급자입니다. 출력을 차례로 내고, 고치기 요청이
 * 오면 다음 출력을 "고친 판"으로 보고 요청받은 칸의 값만 그 판에서 꺼내 보냅니다. Error를 넣으면 그대로 던집니다.
 */
class Stub implements AiClient {
  calls: AiCallSpec[] = [];
  schemas: z.ZodType[] = [];
  fixRequests: { prompt: string; paths: string[] }[] = [];
  constructor(private outputs: unknown[]) {}
  async complete<T>(request: AiCallSpec, schema: z.ZodType<T>, options: AiCallOptions<T> = {}) {
    this.calls.push(request);
    this.schemas.push(schema);
    const usage = { model: "local-test", inputTokens: 10, outputTokens: 20, cacheReadTokens: 0, cacheCreationTokens: 0, durationMs: 1, costUsd: null };
    const next = () => {
      const output = this.outputs.shift();
      if (output instanceof Error) throw output;
      return output;
    };
    return runWithFixes({
      contract: request.contract, schema, options,
      first: async () => ({ output: next(), usage }),
      fix: async (prompt) => {
        const paths = [...prompt.matchAll(/^- (\S+): /gm)].map((match) => match[1]!);
        this.fixRequests.push({ prompt, paths });
        const fixed = next();
        return { output: { fixes: paths.map((path) => ({ path: path === "/" ? "" : path, value: valueAt(fixed, path === "/" ? "" : path) })) }, usage };
      },
    });
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
    const result = await new StructuredPageGenerator(ai, null, { designFirst: false }).generate({
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
    expect(result.manifest.structured?.spec).toEqual(stored(spec));
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
  it("중복 섹션이 있으면 출력을 거절하지 않고 같은 대화에서 요소 목록만 고쳐 받아 렌더링한다", async () => {
    const broken = structuredClone(spec);
    broken.elements.page.children[2] = "index";
    const ai = new Stub([broken, spec]);
    const result = await new StructuredPageGenerator(ai).generate(context);
    expect(ai.calls).toHaveLength(1);
    expect(ai.fixRequests.map((request) => request.paths)).toEqual([["/elements"]]);
    expect(ai.fixRequests[0]!.prompt).toContain("트리의 중복 ID: index");
    expect(result.manifest.structured?.spec).toEqual(stored(spec));
    // 사용량은 첫 호출과 고치기 호출을 합칩니다.
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

  it("내용 정리에서 이름을 바꾸면 그 칸만 고쳐 받고, 고쳐도 바꾸면 중단한다", async () => {
    const changed = structuredClone(modelContent);
    changed.profile.name = "다른 이름";
    const ai = new Stub([changed, changed, changed]);
    await expect(
      new StructuredPageGenerator(ai, null, { designFirst: false }).generate(rawInput),
    ).rejects.toThrow(/내용 정리 결과가 계약 검사를 통과하지 못했습니다: \/profile\/name/);
    expect(ai.calls).toHaveLength(1);
    expect(ai.fixRequests.map((request) => request.paths)).toEqual([["/profile/name"]]);
  });

  it("내용 정리 모델에게 연락처를 묻지 않고, 생성 결과의 연락처는 비어 있다", async () => {
    const ai = new Stub([modelContent, spec]);
    const result = await new StructuredPageGenerator(ai, null, { designFirst: false }).generate(rawInput);
    const schema = z.toJSONSchema(ai.schemas[0]!) as {
      properties: Record<string, unknown>;
    };
    expect(Object.keys(schema.properties)).not.toContain("contact");
    expect(ai.calls[0]!.system).not.toContain("contact");
    expect(result.manifest.structured?.content.contact).toBeNull();
  });

  it("소개 문장 규칙을 어기면 그 칸만 지금 값과 함께 고쳐 받고, 사용량을 합산한다", async () => {
    const broken = structuredClone(modelContent);
    broken.profile.headline = "경로를 설계합니다. 시험도 합니다.";
    const ai = new Stub([broken, modelContent, spec]);
    const result = await new StructuredPageGenerator(ai, null, { designFirst: false }).generate(rawInput);
    expect(ai.calls).toHaveLength(2);
    expect(ai.fixRequests[0]!.paths).toEqual(["/profile/headline"]);
    expect(ai.fixRequests[0]!.prompt).toContain("경로를 설계합니다. 시험도 합니다.");
    expect(result.manifest.structured?.content.profile.headline).toBe(
      content.profile.headline,
    );
    expect(result.manifest.usage.outputTokens).toBe(60);
  });

  it("계약에서 빠진 칸도 그 칸만 고쳐 받고, 연결 오류는 다시 요청하지 않는다", async () => {
    const missing = structuredClone(modelContent) as Partial<
      typeof modelContent
    >;
    delete missing.career;
    const retried = new Stub([missing, modelContent, spec]);
    await new StructuredPageGenerator(retried, null, { designFirst: false }).generate(rawInput);
    expect(retried.calls).toHaveLength(2);
    expect(retried.fixRequests[0]!.paths).toEqual(["/career"]);

    const unavailable = new Stub([
      new AiError("AI_UNAVAILABLE", "page_generation", "claude exited with 1"),
    ]);
    await expect(
      new StructuredPageGenerator(unavailable, null, { designFirst: false }).generate(rawInput),
    ).rejects.toThrow("claude exited with 1");
    expect(unavailable.calls).toHaveLength(1);
  });
  it("모델이 컨테이너로 묶은 Spec을 받아 렌더링하고, 규칙을 어긴 컨테이너는 같은 대화에서 고쳐 받는다", async () => {
    const grouped = structuredClone(spec) as unknown as {
      elements: Record<string, unknown> & { page: { children: string[] } };
    };
    grouped.elements.page.children = ["intro", "group-1"];
    grouped.elements["group-1"] = {
      type: "Columns",
      props: { variant: "wide-end" },
      children: ["index", "section-project-a"],
    };
    const broken = structuredClone(grouped);
    (broken.elements["group-1"] as { props: { variant: string } }).props.variant = "panel";
    const ai = new Stub([broken, grouped]);
    const result = await new StructuredPageGenerator(ai).generate(context);
    expect(ai.calls).toHaveLength(1);
    expect(ai.fixRequests[0]!.prompt).toContain("Columns에 사용할 수 없는 variant");
    expect(ai.calls[0]!.prompt).toContain("컨테이너 예:");
    expect(result.html).toContain('data-group="columns" data-variant="wide-end"');
    expect(result.manifest.structured?.spec).toEqual(stored(grouped));
  });
  it("검사를 통과한 Spec의 렌더링 실패는 모델에 다시 요청하지 않는다", async () => {
    const large = structuredClone(content);
    large.sections[0]!.media = [
      {
        src: "data:image/svg+xml;base64," + "A".repeat(600_000),
        alt: "가상 시험 이미지",
        origin: "fictional",
      },
    ];
    const ai = new Stub([spec, spec]);
    const failure = await new StructuredPageGenerator(ai)
      .generate({ ...context, structuredContent: large })
      .catch((error: unknown) => error);
    expect(ai.calls).toHaveLength(1);
    expect(failure).toBeInstanceOf(PageRenderError);
    expect((failure as Error).message).toMatch(
      /^지면 렌더링에 실패했습니다: .*저장 크기 제한/,
    );
  });
  it("디자인 스펙을 받으면 토큰 키트로 그리고 디자인 검사를 QA에 넣는다", async () => {
    const design = findPortfolioDesign({});
    const result = await new StructuredPageGenerator(new Stub([spec])).generate({ ...context, design });
    expect(result.html).toContain('class="xp-page"');
    expect(result.css.startsWith("@import url(")).toBe(true);
    expect(result.qaReport.status).toBe("ready");
    expect(result.qaReport.checks.map((check) => check.name)).toEqual(
      expect.arrayContaining(["design-contrast", "design-type-size", "design-fonts"]),
    );
    // 본문이 15px보다 작은 디자인은 검토 대상으로 남깁니다.
    const small = structuredClone(design);
    small.typography.scale = small.typography.scale.map((step) =>
      step.name === "body" ? { ...step, size: "0.8rem" } : step,
    );
    const failed = await new StructuredPageGenerator(new Stub([spec])).generate({ ...context, design: small });
    expect(failed.qaReport.status).toBe("failed_qa");
  });
  it("넓은 여백 디자인이면 컨테이너를 고를 수 없고 배치 문단을 프롬프트에 넣는다", async () => {
    // Clarity를 넓은 여백 배치로 바꾼 사본입니다. 배치만 다르고 나머지 토큰은 같습니다.
    const design = structuredClone(findPortfolioDesign({}));
    design.composition.layout = "wide-margin";
    const ai = new Stub([spec]);
    const result = await new StructuredPageGenerator(ai).generate({ ...context, design });
    const layout = designLayout(design);
    expect(ai.calls[0]!.prompt).toContain(describeDesignLayout(layout, design.identity.name));
    expect(ai.calls[0]!.prompt).not.toContain("컨테이너는 지면을 나누는 요소입니다");
    const grouped = structuredClone(spec) as { elements: Record<string, unknown> & { page: { children: string[] } } };
    grouped.elements["group-1"] = { type: "Columns", props: { variant: "even" }, children: ["index", "section-project-a"] };
    grouped.elements.page.children = ["intro", "group-1"];
    expect(ai.schemas[0]!.safeParse(grouped).success).toBe(false);
    expect(result.html).toContain('data-layout="wide-margin"');
  });
  it("포스터형 · 글 · 목록형은 유형 문단을 넣고 유형에 맞는 Spec만 받아 저장한다", async () => {
    const poster = structuredClone(spec) as { elements: Record<string, { type: string; props: Record<string, unknown> }> };
    poster.elements.intro!.props.variant = "poster";
    poster.elements.index!.props.variant = "poster";
    const posterAi = new Stub([poster]);
    const posterResult = await new StructuredPageGenerator(posterAi).generate({ ...context, archetype: "poster" });
    expect(posterAi.calls[0]!.prompt).toContain(describeArchetype("poster"));
    expect(posterAi.calls[0]!.prompt).not.toContain("CaseRow:");
    expect(posterAi.calls[0]!.prompt).not.toContain("컨테이너는 지면을 나누는 요소입니다");
    const posterPage = posterResult.manifest.structured!.spec.elements.page as { props: Record<string, unknown> };
    expect(posterPage.props.archetype).toBe("poster");
    // 포스터형에 사례 상세형 첫 화면을 내면 스키마에서 거절합니다.
    expect(posterAi.schemas[0]!.safeParse(spec).success).toBe(false);

    const list = structuredClone(spec) as { elements: Record<string, { type: string; props: Record<string, unknown> } | undefined> & { page: { children: string[] } } };
    list.elements.intro!.props.variant = "sentence";
    delete list.elements.index;
    list.elements.page.children = list.elements.page.children.filter((key) => key !== "index");
    list.elements["section-project-a"]!.type = "CaseRow";
    const listAi = new Stub([list]);
    const listResult = await new StructuredPageGenerator(listAi).generate({ ...context, archetype: "list" });
    expect(listAi.calls[0]!.prompt).toContain(describeArchetype("list"));
    expect(listAi.calls[0]!.prompt).toContain("목차(ProjectIndex)는 두지 않습니다.");
    expect(listAi.calls[0]!.prompt).not.toContain("ProjectIndex:");
    // 디자인이 없는 문맥이라 저장된 판 렌더러로 그립니다. 유형은 저장 Spec에 남습니다.
    expect((listResult.manifest.structured!.spec.elements.page as { props: Record<string, unknown> }).props.archetype).toBe("list");
  });

  describe("초안 측정과 다듬기", () => {
    /** 결함이 없는 측정값입니다. 지면 글에는 내용 값을 모두 넣어 본문 누락이 나오지 않게 합니다. */
    const clean = (overrides: Partial<RenderMeasurement> = {}): RenderMeasurement => ({
      overflow: false, brokenImages: 0, missingAnchors: [], h1: 1, nameSize: 60, headlineSize: 20, introMotion: "none", hiddenCases: 0,
      stretchedTags: [], overlappedCaptions: [], orphans: [], escaped: [], casesWithImage: [], caseNumbers: ["01"],
      displayFamily: "system-ui", bodyFamily: "system-ui", loadedFamilies: [], contrast: [],
      text: renderedContentValues(content).join(" "), ...overrides,
    });
    const orphan = clean({ orphans: [{ element: "section-project-a", text: "경로 설계 사례" }] });
    const shots = (tag: string): PageScreenshot[] => [
      ...[1, 2].map((part) => ({ name: "390-part" as const, mediaType: "image/jpeg" as const, data: Buffer.from(`${tag}-390-${part}`).toString("base64"), part, parts: 2, truncated: false })),
      ...(["1440-first", "1440-full"] as const).map((name) => ({ name, mediaType: name === "1440-first" ? "image/png" as const : "image/jpeg" as const, data: Buffer.from(`${tag}-${name}`).toString("base64"), part: 1, parts: 1, truncated: false })),
    ];
    /** 부를 때마다 다음 측정값을 세 너비에 똑같이 돌려주는 가짜 측정기입니다. 스크린샷은 몇 번째 측정인지 적힌 가짜 바이트입니다. */
    class FakeMeasurer implements PageMeasurer {
      documents: string[] = [];
      constructor(private readonly results: (RenderMeasurement | Error)[]) {}
      async measure(html: string, options: { screenshots?: boolean } = {}): Promise<PageMeasurement> {
        this.documents.push(html);
        const next = this.results.shift();
        if (next instanceof Error) throw next;
        return { durationMs: 5, widths: [390, 926, 1440].map((width) => ({ width, measurement: next! })), screenshots: options.screenshots ? shots(`m${this.documents.length}`) : [] };
      }
    }
    const changed = (variant = "rows") => {
      const next = structuredClone(spec);
      next.elements.index.props.variant = variant;
      return next;
    };
    const input = { snapshot: { spec: stored(spec), content } };

    it("초안은 한 번만 재고 측정 결함이 있어도 다시 요청하지 않는다", async () => {
      const ai = new Stub([spec]);
      const measurer = new FakeMeasurer([orphan]);
      const result = await new StructuredPageGenerator(ai, measurer).generate(context);
      expect(ai.calls).toHaveLength(1);
      expect(measurer.documents[0]).toContain("<!doctype html>");
      expect(result.manifest.renderMeasure).toMatchObject({ status: "measured", adopted: 0, passes: [{ defects: [{ kind: "orphan" }, { kind: "orphan" }, { kind: "orphan" }] }] });
      expect(result.qaReport.status).toBe("ready");
      expect(result.qaReport.checks.find((check) => check.name === "rendered-layout")).toMatchObject({ status: "fail", severity: "warning" });
      expect(PageGenerationManifestSchema.parse(result.manifest)).toEqual(result.manifest);
    });

    it("초안 측정이 실패하면 생성은 이어가고 건너뛴 이유를 남긴다", async () => {
      const result = await new StructuredPageGenerator(new Stub([spec]), new FakeMeasurer([new Error("browser missing")])).generate(context);
      expect(result.manifest.renderMeasure).toEqual({ status: "skipped", reason: "browser missing", passes: [] });
      expect(result.qaReport.checks.some((check) => check.name.startsWith("rendered-"))).toBe(false);
    });

    it("다듬기: 측정 결함을 고친 뒤 스크린샷 검토로 고친 판이 비교에서 이기면 채택한다", async () => {
      const ai = new Stub([changed("rows"), { critique: ["첫 화면 아래 목차가 사례를 밀어냅니다."], spec: changed("mosaic") }, { winner: "A", reason: "사례가 첫 화면에 보입니다." }]);
      // random() < 0.5 이면 고친 판을 A에 둡니다.
      const generator = new StructuredPageGenerator(ai, new FakeMeasurer([orphan, clean(), clean()]), { random: () => 0.1 });
      const outcome = await generator.refine(input);
      expect(outcome.status).toBe("adopted");
      expect(ai.calls.map((call) => call.contract)).toEqual(["page_generation", "page_review", "page_review"]);
      expect(ai.calls[0]!.prompt).toContain('section-project-a: "경로 설계 사례"의 마지막 줄에 한 글자만 남습니다.');
      // 검토는 결함을 고친 판(두 번째 측정)의 스크린샷을, 비교는 A(고친 판) · B(직전 판)를 봅니다.
      expect(ai.calls[1]!.images!.map((image) => [image.label, Buffer.from(image.data, "base64").toString()])).toEqual([
        ["1440px 첫 화면", "m2-1440-first"], ["1440px 전체(축소)", "m2-1440-full"], ["390px 1/2", "m2-390-1"], ["390px 2/2", "m2-390-2"],
      ]);
      expect(ai.calls[2]!.images!.map((image) => image.label.slice(0, 1))).toEqual(["A", "A", "A", "A", "B", "B", "B", "B"]);
      expect(Buffer.from(ai.calls[2]!.images![0]!.data, "base64").toString()).toBe("m3-1440-first");
      expect(outcome.review).toMatchObject({ status: "adopted", critique: ["첫 화면 아래 목차가 사례를 밀어냅니다."], comparison: { winner: "revised", reason: "사례가 첫 화면에 보입니다." } });
      expect(outcome.result!.manifest.renderMeasure).toMatchObject({ adopted: 2 });
      expect((outcome.result!.manifest.structured!.spec.elements.index as { props: { variant: string } }).props.variant).toBe("mosaic");
      expect(PageGenerationManifestSchema.parse(outcome.result!.manifest)).toEqual(outcome.result!.manifest);
    });

    it("다듬기: 비교에서 직전 판이 이기면 결함을 고친 판까지만 채택한다", async () => {
      const ai = new Stub([changed("rows"), { critique: ["목차를 카드로 바꿉니다."], spec: changed("mosaic") }, { winner: "A", reason: "직전 판이 더 차분합니다." }]);
      // random() >= 0.5 이면 고친 판을 B에 두므로 A 승리는 직전 판 승리입니다.
      const outcome = await new StructuredPageGenerator(ai, new FakeMeasurer([orphan, clean(), clean()]), { random: () => 0.9 }).refine(input);
      expect(outcome.status).toBe("adopted");
      expect(outcome.review.comparison).toEqual({ winner: "draft", reason: "직전 판이 더 차분합니다." });
      expect((outcome.result!.manifest.structured!.spec.elements.index as { props: { variant: string } }).props.variant).toBe("rows");
    });

    it("다듬기: 비교에서 초안이 이기면 초안을 유지한다", async () => {
      const ai = new Stub([{ critique: ["목차를 카드로 바꿉니다."], spec: changed("mosaic") }, { winner: "B", reason: "초안이 낫습니다." }]);
      const outcome = await new StructuredPageGenerator(ai, new FakeMeasurer([clean(), clean()]), { random: () => 0.1 }).refine(input);
      expect(outcome).toMatchObject({ status: "kept", review: { status: "kept", comparison: { winner: "draft" }, calls: 2, costUsd: null } });
      // 진 판의 구성도 다시 볼 수 있게 남습니다.
      expect((outcome.review.revisedSpec!.elements.index as { props: { variant: string } }).props.variant).toBe("mosaic");
      expect(outcome.result).toBeUndefined();
    });

    it("다듬기: 고친 구성이 측정 결함을 늘리면 비교 없이 초안을 유지한다", async () => {
      const ai = new Stub([{ critique: ["사례를 두 칸으로 나눕니다."], spec: changed("mosaic") }]);
      const outcome = await new StructuredPageGenerator(ai, new FakeMeasurer([clean(), orphan])).refine(input);
      expect(ai.calls).toHaveLength(1);
      expect(outcome.review.reason).toBe("고친 구성이 측정 결함을 늘렸습니다.");
      expect(outcome.status).toBe("kept");
    });

    it("다듬기: 이미지를 받지 못하는 공급자면 검토를 건너뛴다", async () => {
      const ai = new Stub([new AiError("AI_UNAVAILABLE", "page_review", "codex provider does not accept image input")]);
      const outcome = await new StructuredPageGenerator(ai, new FakeMeasurer([clean()])).refine(input);
      expect(outcome.status).toBe("skipped");
      expect(outcome.review.reason).toContain("스크린샷 검토를 하지 못했습니다");
    });

    it("다듬기: 측정기가 없으면 건너뛴다", async () => {
      expect((await new StructuredPageGenerator(new Stub([])).refine(input)).status).toBe("skipped");
    });
  });
});
