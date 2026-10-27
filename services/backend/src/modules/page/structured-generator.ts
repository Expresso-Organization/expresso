import { createHash } from "node:crypto";
import { z } from "zod";
import {
  DEFAULT_PORTFOLIO_ARCHETYPE,
  PAGE_PROMPT_VERSION,
  STRUCTURED_GROUP_TYPES,
  archetypeComponents,
  pageDocument,
  StructuredContentModelSchema,
  StructuredPortfolioContentSchema,
  structuredModelSchema,
  type StructuredContentModel,
  type StructuredPortfolioContent,
  type PageGenerationManifest,
  type PageRenderDefect,
  type PageRenderMeasure,
  type PageVisualReview,
} from "@expresso/contracts";
import {
  describeArchetype,
  describeDesignLayout,
  designLayout,
  designQa,
  describeRenderDefects,
  renderDefects,
  renderStructuredPortfolio,
  validateRenderableSpec,
  structuredCatalog,
} from "@expresso/portfolio-renderer";
import {
  AiError,
  type AiClient,
  type AiImage,
  type AiModelTier,
  type AiUsage,
} from "../../platform/ai/client.js";
import type { PageMeasurer, PageScreenshot } from "../../platform/browser/page-measurer.js";
import { ungroundedNumbers, isOrdinalLabel } from "../../platform/numbers.js";
import {
  PageGenerationError,
  PageRenderError,
  visibleText,
  DESIGN_PRINCIPLES_VERSION,
  type PageGenerator,
  type PageGenerationContext,
  type PageStreamSink,
  type GeneratedPageResult,
} from "./generator.js";
import {
  describeGroupRules,
  describeSpecSchema,
} from "./structured-spec-format.js";

export function structuredSpecPrompt(
  content: StructuredPortfolioContent,
  options: {
    instruction?: string | undefined;
    previous?: unknown;
    schema?: z.ZodType;
    /** 고른 디자인의 배치 문단(`describeDesignLayout`). 없으면 디자인 없이 구성만 정한다고 알립니다. */
    layout?: string | undefined;
    /** 고른 유형의 문단(`describeArchetype`). */
    archetype?: string | undefined;
    /** 카탈로그 설명에 보일 컴포넌트(`archetypeComponents`). 없으면 전부 보입니다. */
    components?: readonly string[] | undefined;
  } = {},
): string {
  const instruction = options.instruction ?? "";
  const previous = options.previous ?? null;
  const schema = options.schema ?? structuredModelSchema(content);
  const layout = options.layout;
  // 요소 ID와 props 형태는 공급자에 넘기는 출력 스키마에서 만듭니다. 아래 문장은 스키마로 표현할 수 없는 규칙입니다.
  const format = describeSpecSchema(schema);
  const ids = format.required;
  // 컨테이너를 쓸 수 있는지는 출력 스키마가 정합니다. 넓은 여백 디자인은 group 요소가 없습니다.
  const groups = format.optional.length > 0;
  // 목차와 첫 화면 구도 선택도 출력 스키마가 정합니다. 글 · 목록형은 목차가 없고, 포스터 · 글 · 목록형은 첫 화면 구도가 하나로 고정됩니다.
  const hasIndex = ids.includes("index");
  const introLine = format.text.split("\n").find((line) => line.startsWith("elements.intro")) ?? "";
  const introChoices = introLine.includes('"split"');
  const groupId = format.optional[0] ?? "group-1";
  // 예시는 첫 사례와 그 옆에 둘 보조 요소로 만듭니다. 보조 요소가 없으면 두 번째 사례를 씁니다.
  const pair = [
    `section-${content.sections[0]!.id}`,
    content.evidence.length
      ? "evidence"
      : content.career.length
        ? "career"
        : content.sections[1]
          ? `section-${content.sections[1].id}`
          : "index",
  ];
  const example = {
    page: ids.flatMap((key) =>
      key === pair[0] ? [groupId] : pair.includes(key) ? [] : [key],
    ),
    group: {
      type: "Columns",
      props: { variant: "wide-start" },
      children: pair,
    },
  };
  return `개인 포트폴리오의 json-render Spec을 작성하세요. HTML/CSS를 쓰지 않습니다.
${Object.entries(structuredCatalog.data.components)
  .filter(([name]) => (options.components ? options.components.includes(name) : true))
  .filter(([name]) => groups || !(STRUCTURED_GROUP_TYPES as readonly string[]).includes(name))
  .map(([name, component]) => `${name}: ${component.description}`)
  .join("\n")}
입력 특징: ${JSON.stringify({ profile: content.profile, sections: content.sections.map((section) => ({ id: section.id, title: section.title, summary: section.summary, pattern: section.pattern, bodyLength: section.body.length, images: section.media.length, imageDescriptions: section.media.map((item) => item.alt), details: section.details.map((item) => ({ label: item.label, excerpt: item.text.slice(0, 160) })) })), careerCount: content.career.length, evidenceCount: content.evidence.length, contact: !!content.contact })}
${layout ?? "색·서체·간격은 사용자가 고른 디자인 시스템이 정하고, 이 Spec은 구성만 정합니다."}${options.archetype ? `\n${options.archetype}` : ""}
구성은 첫 화면 구도, 사례 유형, 목차 형태${groups ? ", 컨테이너 배치" : ""}입니다. rationale에는 이미지·본문 길이·설명 유형과 위 배치를 근거로 고른 구성의 이유를 씁니다. motion은 'showcase'를 씁니다. 자료마다 사례 유형을 독립적으로 선택합니다.
출력 형식(공급자에 넘기는 출력 스키마에서 생성):
${format.text}
모든 요소 ID를 트리 전체에서 정확히 한 번씩 연결합니다. 사용할 요소 ID: ${JSON.stringify(ids)}. ${groups ? "요소는 page.children에 바로 두거나 컨테이너의 children에 넣습니다. 첫 ID는 intro, 연락처가 있으면 마지막 ID는 contact이며 둘은 컨테이너에 넣지 않습니다." : "모든 요소를 page.children에 바로 둡니다. 첫 ID는 intro, 연락처가 있으면 마지막 ID는 contact입니다."}
${groups ? `컨테이너는 지면을 나누는 요소입니다. 요소 ID는 ${groupId}부터 차례로 쓰고, 각 컨테이너를 page.children에서 한 번 참조합니다. 컨테이너 안에 컨테이너를 넣지 않습니다. ${describeGroupRules()} 자료의 비중과 관계에 맞을 때만 쓰고, 쓰지 않아도 됩니다.
컨테이너 예: page.children=${JSON.stringify(example.page)}, elements["${groupId}"]=${JSON.stringify(example.group)}. 컨테이너에 넣은 ID는 page.children에 다시 쓰지 않습니다.
` : ""}NameIntro는 첫 요소로 한 번 둡니다.${introChoices ? " 이름이 가장 크고 바로 아래 한 문장을 둡니다. variant는 소개 문단이 짧고 한 문장이 강하면 'statement', 소개 문단과 집중 분야가 함께 읽혀야 하면 'split', 대표 이미지가 첫 인상을 정할 만하면 'media'를 고릅니다." : " variant는 형식에 적힌 값 하나를 씁니다."}
모든 section을 정확히 한 번, 알맞은 사례 타입으로 표시합니다. 이미지 없는 section에 CaseGallery를 쓰지 않습니다. CaseProcess에는 설명 두 개 이상이 필요합니다.
${hasIndex ? `ProjectIndex는 필수이며 요소 ID는 index입니다. ${groups ? "소개 바로 다음에 두거나, variant='rail'로 Columns에 넣어 사례 옆 목차로 씁니다." : "소개 바로 다음에 둡니다."}` : "목차(ProjectIndex)는 두지 않습니다."}
경력·근거·사례의 순서는 자유롭게 선택할 수 있습니다. contact가 있으면 마지막에 둡니다. 형식에 없는 속성, 경로, 텍스트를 props에 추가하지 마세요.
직전 Spec: ${JSON.stringify(previous)}
수정 요청: ${instruction || "자료를 읽기 좋은 구성으로 조립하세요."}
${groups ? "컨테이너 없이 쓰는 " : ""}유효한 page.children 예시: ${JSON.stringify(ids)}. 첫 ID는 intro이며 마지막 ID는 ${content.contact ? "contact" : "자료에 맞는 요소"}입니다. 가운데 사례·경력·근거의 순서는 바꿀 수 있습니다. 연락처 뒤에 다른 요소를 추가하지 않습니다.`;
}

type NormalizationInput = {
  author: { name: string };
  sections: { id: string }[];
  evidence: { id: string }[];
};

/**
 * 내용 정리 출력을 저장 계약 값으로 만듭니다.
 *
 * 연락처는 입력 경로가 없어 null로 정합니다. 저장 계약의 규칙(이름 아래 한 문장)과
 * 입력 보존 규칙을 검사하고, 어기면 모델이 읽을 수 있는 문장으로 던집니다.
 */
function normalizedContent(
  data: StructuredContentModel,
  input: NormalizationInput,
  context: PageGenerationContext,
): StructuredPortfolioContent {
  const parsed = StructuredPortfolioContentSchema.safeParse({
    ...data,
    contact: null,
  });
  if (!parsed.success)
    throw new Error(
      parsed.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; "),
    );
  const content = parsed.data;
  const expectedIds = input.sections.map((item) => item.id).sort();
  if (
    content.profile.name !== input.author.name ||
    JSON.stringify(content.sections.map((item) => item.id).sort()) !==
      JSON.stringify(expectedIds)
  )
    throw new Error(
      `이름(${input.author.name})과 섹션 ID(${expectedIds.join(", ")})를 그대로 사용해야 합니다.`,
    );
  const sources = new Set(input.evidence.map((item) => item.id));
  const extra = content.evidence
    .filter((item) => !sources.has(item.id))
    .map((item) => item.id);
  if (extra.length)
    throw new Error(
      `제공되지 않은 근거 ID를 추가했습니다: ${extra.join(", ")}.`,
    );
  const provided = new Set(context.media.map((item) => item.src));
  if (
    content.sections.some((section) =>
      section.media.some(
        (item) => !provided.has(item.src) || item.origin !== "uploaded",
      ),
    )
  )
    throw new Error(
      "제공되지 않은 이미지를 추가했습니다. 입력 media의 src만 origin=uploaded로 사용합니다.",
    );
  return content;
}

/** 다듬기에서 측정 결함으로 구성을 다시 요청하는 최대 횟수입니다. */
const MEASURE_RETRIES = 2;

type Snapshot = ReturnType<typeof validateRenderableSpec>;
type AcceptedSpec = {
  snapshot: Snapshot;
  root: Extract<Snapshot["spec"]["elements"][string], { type: "PortfolioPage" }>;
};
type SetupContext = Pick<PageGenerationContext, "design" | "style" | "archetype">;

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, 1_000);

/**
 * 고른 디자인 · 유형으로 출력 스키마와 프롬프트 재료를 만듭니다. 생성과 다듬기가 같은 선택지를 쓰게 한곳에 둡니다.
 */
function specSetup(content: StructuredPortfolioContent, context: SetupContext) {
  const fixedLayout =
    context.style?.structure === "wide-margin"
      ? "editorial"
      : context.style?.structure === "dense-grid"
        ? "dossier"
        : context.style
          ? "library"
          : null;
  // 새 생성은 수집 원본을 고르지 않습니다. 선택지를 비우면 출력 스키마에 sourceId가 없습니다.
  // 컨테이너 선택지와 배치 문단은 고른 디자인의 배치 계산에서 함께 나옵니다.
  const layout = context.design ? designLayout(context.design) : null;
  // 유형(페이지 짜임새)은 사용자가 고릅니다. 고르지 않았으면 사례 상세형입니다.
  const archetype = context.archetype ?? DEFAULT_PORTFOLIO_ARCHETYPE;
  const schema = structuredModelSchema(content, {
    intro: [],
    section: [],
    guidance: [],
    archetype,
    ...(layout ? { groups: layout.groups } : {}),
  });
  const prompt = (options: { instruction?: string | undefined; previous?: unknown }) =>
    structuredSpecPrompt(content, {
      ...options,
      schema,
      layout: layout ? describeDesignLayout(layout, context.design!.identity.name) : undefined,
      archetype: describeArchetype(archetype),
      components: archetypeComponents(archetype, layout?.groups ?? STRUCTURED_GROUP_TYPES),
    });
  // 모델은 design을 고르지 않습니다. 저장 계약의 배치 이름은 편집 화면이 읽으므로 사용자 스타일에서 채웁니다.
  const accept = (data: unknown): AcceptedSpec => {
    const spec = structuredClone(data) as { elements?: Record<string, { type?: string; props?: Record<string, unknown> }> };
    const page = spec.elements?.page;
    if (page?.type === "PortfolioPage" && page.props)
      page.props = { ...page.props, design: { layout: fixedLayout ?? "library" }, archetype };
    const snapshot = validateRenderableSpec(spec, content);
    const root = snapshot.spec.elements[snapshot.spec.root]!;
    if (root.type !== "PortfolioPage") throw new Error("페이지 루트가 필요합니다.");
    return { snapshot, root };
  };
  return { schema, prompt, accept };
}

function renderSpec(snapshot: Snapshot, context: SetupContext) {
  try {
    return renderStructuredPortfolio(snapshot.spec, snapshot.content, { design: context.design, theme: context.style });
  } catch (error) {
    throw new PageRenderError(
      `지면 렌더링에 실패했습니다: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}

/** 그린 결과를 공개 페이지와 같은 문서로 열어 잽니다. */
async function measureRendered(
  measurer: PageMeasurer,
  page: { html: string; css: string },
  content: StructuredPortfolioContent,
  style: PageGenerationContext["style"],
  options: { screenshots?: boolean } = {},
) {
  const result = await measurer.measure(pageDocument({ html: page.html, css: page.css, title: content.profile.name, ...(style ? { grammar: style } : {}) }), options);
  return { durationMs: result.durationMs, defects: renderDefects(result.widths, content), screenshots: result.screenshots };
}

const fixableCount = (defects: readonly PageRenderDefect[]) => defects.filter((item) => item.fixable).length;

export class StructuredPageGenerator implements PageGenerator {
  /** 측정기가 없으면(API 프로세스 · 브라우저 없는 환경) 그린 결과를 재지 않습니다. */
  constructor(
    private readonly ai: AiClient,
    private readonly measurer: PageMeasurer | null = null,
    /** 전후 비교에서 고친 판을 A · B 중 어디에 둘지 정합니다. 테스트가 고정합니다. */
    private readonly random: () => number = Math.random,
  ) {}
  async generate(
    context: PageGenerationContext,
    sink: PageStreamSink | null = null,
  ): Promise<GeneratedPageResult> {
    const usages: AiUsage[] = [];
    let content = context.structuredContent;
    if (!content) {
      if (!context.author?.name)
        throw new PageGenerationError("포트폴리오에 표시할 이름이 필요합니다.");
      const input = {
        author: context.author,
        sections: context.sections.map((section, index) => ({
          ...section,
          id: section.id ?? `section-${index + 1}`,
        })),
        evidence: context.evidence.map((item, index) => ({
          ...item,
          id: item.id ?? `source-${index + 1}`,
        })),
        plan: context.portfolioPlan,
        media: context.media,
      };
      // 모델이 고칠 수 있는 오류는 직전 출력과 오류를 붙여 한 번 다시 요청합니다.
      const attempts: { output: unknown; error: string }[] = [];
      for (let attempt = 0; attempt < 2 && !content; attempt++) {
        const last = attempts.at(-1);
        const prompt = last
          ? `${JSON.stringify(input)}\n직전 출력: ${JSON.stringify(last.output)}\n검사 오류: ${last.error}\n수정한 전체 결과를 출력하세요.`
          : JSON.stringify(input);
        let data: StructuredContentModel;
        try {
          const result = await this.ai.complete(
            {
              contract: "page_generation",
              promptVersion: PAGE_PROMPT_VERSION,
              ...(context.modelTier ? { modelTier: context.modelTier } : {}),
              system:
                "출처 자료에서 포트폴리오 표시용 내용을 정리합니다. 제공된 이름·섹션 ID·출처 ID를 그대로 사용합니다. 수치·성과·경력·연락처·이미지를 지어내지 않습니다. 이름 아래 headline은 직무와 구체적인 작업을 밝히는 짧은 한 문장입니다. 36자 안으로 작성합니다. 섹션의 period는 출처에 적힌 기간(예: 2025.08 — 2026.02)만 옮기고, 출처에 없으면 비웁니다. 입력 자료의 개인정보는 필요한 표시 내용만 추립니다. 원본 전체를 evidence.body에 복사하지 않습니다.",
              prompt,
            },
            StructuredContentModelSchema,
            sink ? { userId: context.userId, onThinking: (tokens) => sink.thinking(tokens) } : { userId: context.userId },
          );
          usages.push(result.usage);
          data = result.data;
        } catch (error) {
          // 공급자 스키마 위반은 출력이 남지 않으므로 오류만 붙여 다시 요청합니다.
          if (error instanceof AiError && error.code === "AI_INVALID_OUTPUT") {
            attempts.push({ output: null, error: error.message });
            continue;
          }
          throw error;
        }
        try {
          content = normalizedContent(data, input, context);
        } catch (error) {
          attempts.push({
            output: data,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      if (!content)
        throw new PageGenerationError(
          `내용 정리 결과가 계약 검사를 통과하지 못했습니다: ${attempts.at(-1)?.error}`,
        );
    }
    content = StructuredPortfolioContentSchema.parse(content);
    const setup = specSetup(content, context);
    const { schema } = setup;
    const prompt = setup.prompt({
      instruction: context.instruction,
      previous: context.previous?.structured?.spec,
    });
    // 모델이 고칠 수 있는 Spec 검사 실패만 다시 요청합니다. 렌더링은 검사를 통과한 뒤 한 번만 합니다.
    const attempts: { output: unknown; error: string }[] = [];
    let accepted: (AcceptedSpec & { attempt: number; usage: AiUsage }) | null = null;
    for (let attempt = 0; attempt < 2 && !accepted; attempt++) {
      const request = attempts.length
        ? `${prompt}\n직전 출력: ${JSON.stringify(attempts[0]?.output)}\n검사 오류: ${attempts[0]?.error}. 수정한 전체 Spec을 출력하세요.`
        : prompt;
      const result = await this.ai.complete(
        {
          contract: "page_generation",
          system:
            "등록된 컴포넌트와 데이터 참조만 사용하여 json-render Spec을 만듭니다.",
          prompt: request,
          promptVersion: PAGE_PROMPT_VERSION,
          ...(context.modelTier ? { modelTier: context.modelTier } : {}),
        },
        schema,
        sink ? { userId: context.userId, onThinking: (tokens) => sink.thinking(tokens) } : { userId: context.userId },
      );
      usages.push(result.usage);
      try {
        accepted = { ...setup.accept(result.data), attempt, usage: result.usage };
      } catch (error) {
        attempts.push({
          output: result.data,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    if (!accepted)
      throw new PageGenerationError(
        `구성 계약 검사를 통과하지 못했습니다: ${attempts.at(-1)?.error}`,
      );
    const { snapshot, root, attempt } = accepted;
    const rendered = renderSpec(snapshot, context);
    // 초안은 한 번만 잽니다. 결함을 고치는 재요청과 스크린샷 검토는 초안을 저장한 뒤 다듬기(`refine`)에서 합니다.
    let renderMeasure: PageRenderMeasure | undefined;
    if (this.measurer) {
      try {
        const measured = await measureRendered(this.measurer, rendered, snapshot.content, context.style);
        renderMeasure = { status: "measured", adopted: 0, passes: [{ durationMs: measured.durationMs, defects: measured.defects }] };
      } catch (error) {
        renderMeasure = { status: "skipped", reason: errorText(error), passes: [] };
      }
    }
    // 스트림 소비자는 기존 html/css 필드를 읽습니다. 완성된 검증 결과만 내보냅니다.
    sink?.delta(JSON.stringify(rendered));
    const source = context.structuredContent
      ? JSON.stringify(context.structuredContent)
      : context.evidence.map((item) => item.text).join("\n");
    return pageResult({ rendered, snapshot, root, usages, prompt, attempt, source, design: context.design, renderMeasure });
  }

  /**
   * 저장한 초안을 다듬습니다.
   *
   * (1) 측정 결함이 있으면 결함 문장을 붙여 구성을 다시 받고(최대 2회, 결함이 줄어든 판만),
   * (2) 지면 스크린샷을 보여 위계 · 강조 · 여백 · 리듬을 고친 구성을 받고,
   * (3) 고친 판이 결함을 늘리지 않으면 전후 스크린샷을 무작위 순서로 보여 더 나은 쪽을 고르게 합니다.
   * 초안보다 나은 판이 없으면 `kept`입니다. 모델은 구성만 고치고 내용은 그대로입니다.
   */
  async refine(input: PageRefineInput): Promise<PageRefineOutcome> {
    const started = Date.now();
    const usages: AiUsage[] = [];
    const review = (status: PageVisualReview["status"], extra: Partial<PageVisualReview> = {}): PageVisualReview => ({
      status,
      critique: [],
      durationMs: Date.now() - started,
      calls: usages.length,
      costUsd: usages.reduce<number | null>((sum, item) => (sum === null || item.costUsd === null ? null : sum + item.costUsd), 0),
      ...extra,
    });
    if (!this.measurer) return { status: "skipped", review: review("skipped", { reason: "측정 브라우저가 없습니다." }) };
    const measurer = this.measurer;
    const content = StructuredPortfolioContentSchema.parse(input.snapshot.content);
    const setup = specSetup(content, input);
    const call = async <T>(prompt: string, schema: z.ZodType<T>, contract: "page_generation" | "page_review", system: string, images?: AiImage[]) => {
      const result = await this.ai.complete(
        { contract, system, prompt, promptVersion: PAGE_PROMPT_VERSION, ...(input.modelTier ? { modelTier: input.modelTier } : {}), ...(images ? { images } : {}) },
        schema,
        { userId: input.userId },
      );
      usages.push(result.usage);
      return result.data;
    };
    const draft = setup.accept(input.snapshot.spec);
    const draftRendered = renderSpec(draft.snapshot, input);
    const draftMeasured = await measureRendered(measurer, draftRendered, content, input.style, { screenshots: true });
    const passes: PageRenderMeasure["passes"] = [{ durationMs: draftMeasured.durationMs, defects: draftMeasured.defects }];
    type Candidate = AcceptedSpec & { rendered: { html: string; css: string }; defects: PageRenderDefect[]; screenshots: PageScreenshot[]; pass: number };
    const draftCandidate: Candidate = { ...draft, rendered: draftRendered, defects: draftMeasured.defects, screenshots: draftMeasured.screenshots, pass: 0 };
    let best = draftCandidate;
    let lastPrompt = "";
    const tryCandidate = async (data: unknown): Promise<Candidate | null> => {
      let accepted: AcceptedSpec;
      let rendered: { html: string; css: string };
      try {
        accepted = setup.accept(data);
        rendered = renderSpec(accepted.snapshot, input);
      } catch (error) {
        passes.push({ durationMs: 0, defects: [], rejected: errorText(error) });
        return null;
      }
      const measured = await measureRendered(measurer, rendered, content, input.style, { screenshots: true });
      passes.push({ durationMs: measured.durationMs, defects: measured.defects });
      return { ...accepted, rendered, defects: measured.defects, screenshots: measured.screenshots, pass: passes.length - 1 };
    };
    // (1) 측정 결함 고치기 — 결함이 줄어든 판만 받습니다.
    for (let retry = 0; retry < MEASURE_RETRIES && fixableCount(best.defects) > 0; retry++) {
      lastPrompt = setup.prompt({
        instruction: `${input.instruction ? `사용자 수정 요청: ${input.instruction}\n` : ""}${describeRenderDefects(best.defects)}`,
        previous: best.snapshot.spec,
      });
      const candidate = await tryCandidate(await call(lastPrompt, setup.schema, "page_generation", SPEC_SYSTEM));
      if (candidate && fixableCount(candidate.defects) < fixableCount(best.defects)) best = candidate;
    }
    // (2) 스크린샷 검토 — 지적 목록과 고친 구성을 받습니다.
    let critique: string[] = [];
    let comparison: PageVisualReview["comparison"];
    let revisedSpec: PageVisualReview["revisedSpec"];
    let reason: string | undefined;
    try {
      lastPrompt = `${setup.prompt({ instruction: input.instruction, previous: best.snapshot.spec })}\n${REVIEW_GUIDE}`;
      const reviewed = await call(lastPrompt, z.object({ critique: z.array(z.string().max(300)).min(1).max(8), spec: setup.schema }), "page_review", REVIEW_SYSTEM, screenshotImages(best.screenshots, ""));
      critique = reviewed.critique;
      const revised = await tryCandidate(reviewed.spec);
      if (revised) revisedSpec = revised.snapshot.spec;
      if (!revised) reason = "고친 구성이 계약 검사를 지나지 못했습니다.";
      else if (JSON.stringify(revised.snapshot.spec) === JSON.stringify(best.snapshot.spec)) reason = "모델이 구성을 바꾸지 않았습니다.";
      else if (fixableCount(revised.defects) > fixableCount(best.defects)) reason = "고친 구성이 측정 결함을 늘렸습니다.";
      else {
        // (3) 전후 비교 — 고친 판이 어느 쪽인지 알리지 않고 순서를 섞습니다.
        const revisedFirst = this.random() < 0.5;
        const [a, b] = revisedFirst ? [revised, best] : [best, revised];
        const judged = await call(
          COMPARE_GUIDE,
          z.object({ winner: z.enum(["A", "B"]), reason: z.string().max(600) }),
          "page_review",
          COMPARE_SYSTEM,
          [...screenshotImages(a.screenshots, "A · "), ...screenshotImages(b.screenshots, "B · ")],
        );
        const revisedWon = (judged.winner === "A") === revisedFirst;
        comparison = { winner: revisedWon ? "revised" : "draft", reason: judged.reason };
        if (revisedWon) best = revised;
      }
    } catch (error) {
      // 이미지를 받지 못하는 공급자 등. 결함 고치기로 나아진 판이 있으면 그 판은 씁니다.
      if (!(error instanceof AiError)) throw error;
      reason = `스크린샷 검토를 하지 못했습니다: ${errorText(error)}`;
    }
    const renderMeasure: PageRenderMeasure = { status: "measured", adopted: best.pass, passes };
    if (best === draftCandidate) {
      const status = critique.length || comparison ? "kept" : "skipped";
      return { status, review: review(status, { critique, ...(comparison ? { comparison } : {}), ...(revisedSpec ? { revisedSpec } : {}), ...(reason ? { reason } : {}) }) };
    }
    const visualReview = review("adopted", { critique, ...(comparison ? { comparison } : {}), ...(revisedSpec ? { revisedSpec } : {}), ...(reason ? { reason } : {}) });
    const result = pageResult({
      rendered: best.rendered, snapshot: best.snapshot, root: best.root, usages, prompt: lastPrompt, attempt: 0,
      source: JSON.stringify(content), design: input.design, renderMeasure, visualReview,
    });
    return { status: "adopted", review: visualReview, result };
  }
}

/** 다듬기 입력입니다. 저장된 초안에서 만듭니다. */
export interface PageRefineInput extends SetupContext {
  /** 사용량을 남길 사용자. */
  userId: string | null;
  snapshot: { spec: unknown; content: unknown };
  instruction?: string | undefined;
  modelTier?: AiModelTier | undefined;
}

export interface PageRefineOutcome {
  status: "adopted" | "kept" | "skipped";
  review: PageVisualReview;
  /** 채택했을 때만 있습니다. 새 판으로 저장합니다. */
  result?: GeneratedPageResult;
}

const SPEC_SYSTEM = "등록된 컴포넌트와 데이터 참조만 사용하여 json-render Spec을 만듭니다.";
const REVIEW_SYSTEM = "포트폴리오 지면의 디자인 검토자입니다. 그려진 화면을 보고 등록된 컴포넌트와 데이터 참조만으로 구성을 고칩니다.";
const COMPARE_SYSTEM = "포트폴리오 지면의 시각 품질을 비교하는 디자인 심사자입니다.";
const REVIEW_GUIDE = `## 스크린샷 검토
함께 보낸 이미지는 직전 Spec을 실제로 그린 지면입니다(1440px 첫 화면, 1440px 전체 축소본, 390px 위에서부터 조각). 이 지면의 시각 품질을 평가하고 구성을 고치세요.
볼 것: 첫 화면이 이 사람의 직무와 대표 작업을 바로 보여 주는가 · 가장 중요한 사례가 먼저 · 크게 보이는가(위계) · 같은 모양의 사례가 이어져 단조롭지 않은가(리듬) · 여백과 밀도가 고른 디자인에 맞는가 · 390px에서도 읽기 편한가.
글(내용)은 바꿀 수 없습니다. 첫 화면 구도, 사례 유형과 순서, 컨테이너, 목차 형태만 바꿉니다.
critique에는 고칠 점을 화면에 보이는 말로 하나씩 짧게 적고, spec에는 고친 전체 Spec을 냅니다. 고칠 점이 없으면 직전 Spec을 그대로 냅니다.`;
const COMPARE_GUIDE = `같은 내용으로 만든 포트폴리오 지면 두 판(A, B)의 스크린샷입니다. 판마다 1440px 첫 화면, 1440px 전체 축소본, 390px 위에서부터 조각을 보냅니다.
채용 담당자가 처음 열었을 때 더 잘 읽히고 완성도가 높아 보이는 판을 고르세요. 기준: 첫 화면의 인상과 위계, 사례 강조, 리듬과 여백, 디자인 일관성, 좁은 화면 가독성.
winner에 A 또는 B를, reason에 화면에 보이는 근거를 적습니다.`;

const SHOT_LABELS: Record<PageScreenshot["name"], string> = { "1440-first": "1440px 첫 화면", "1440-full": "1440px 전체(축소)", "390-part": "390px" };
function screenshotImages(shots: readonly PageScreenshot[], prefix: string): AiImage[] {
  // 1440 첫 화면 · 전체를 먼저, 390 조각을 위에서부터 보냅니다.
  const order = (shot: PageScreenshot) => (shot.name === "1440-first" ? 0 : shot.name === "1440-full" ? 1 : 2) * 10 + shot.part;
  return [...shots].sort((a, b) => order(a) - order(b)).map((shot) => ({
    mediaType: shot.mediaType,
    data: shot.data,
    label: `${prefix}${SHOT_LABELS[shot.name]}${shot.parts > 1 ? ` ${shot.part}/${shot.parts}` : ""}${shot.truncated ? "(아래쪽 잘림)" : ""}`,
  }));
}

/** 초안 · 다듬은 판의 결과를 같은 모양으로 만듭니다. */
function pageResult(input: {
  rendered: { html: string; css: string };
  snapshot: Snapshot;
  root: AcceptedSpec["root"];
  usages: AiUsage[];
  prompt: string;
  attempt: number;
  source: string;
  design: PageGenerationContext["design"];
  renderMeasure: PageRenderMeasure | undefined;
  visualReview?: PageVisualReview;
}): GeneratedPageResult {
  const { rendered, snapshot, root, renderMeasure } = input;
  const usage = input.usages.reduce(
    (sum, item) => ({
      ...sum,
      model: item.model,
      inputTokens: sum.inputTokens + item.inputTokens,
      outputTokens: sum.outputTokens + item.outputTokens,
      cacheReadTokens: sum.cacheReadTokens + item.cacheReadTokens,
      cacheCreationTokens: sum.cacheCreationTokens + item.cacheCreationTokens,
      durationMs: sum.durationMs + item.durationMs,
      costUsd: sum.costUsd === null || item.costUsd === null ? null : sum.costUsd + item.costUsd,
    }),
    { model: input.usages[0]?.model ?? "unknown", inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, durationMs: 0, costUsd: 0 as number | null },
  );
  const ungrounded = ungroundedNumbers(visibleText(rendered.html), input.source).filter(
    (number) => number.replace(/\D/g, "").length >= 2 && !isOrdinalLabel(number),
  );
  const { model: usageModel, ...manifestUsage } = usage;
  const manifest: PageGenerationManifest = {
    methodologyVersion: 1,
    model: usageModel,
    promptHash: createHash("sha256").update(input.prompt).digest("hex"),
    promptVersions: {
      page: PAGE_PROMPT_VERSION,
      designPrinciples: DESIGN_PRINCIPLES_VERSION,
    },
    tools: [],
    sourceUrls: [],
    attempts: input.attempt + 1,
    repairCount: input.attempt,
    usage: manifestUsage,
    structured: snapshot,
    ...(renderMeasure ? { renderMeasure } : {}),
    ...(input.visualReview ? { visualReview: input.visualReview } : {}),
  };
  // 디자인 토큰의 정적 검사입니다. 오류 하나라도 실패하면 지면을 검토 대상으로 표시합니다.
  const designChecks = input.design ? designQa(input.design) : [];
  // 측정 결과는 경고로 남깁니다. 결함이 남아도 지면을 공개에서 빼지 않습니다 — 렌더러 결함까지 사용자에게 떠넘기지 않습니다.
  const adoptedDefects = renderMeasure?.status === "measured" ? renderMeasure.passes[renderMeasure.adopted ?? 0]!.defects : null;
  const summarize = (defects: readonly PageRenderDefect[]) =>
    [...new Set(defects.map((item) => `${item.width}px ${item.element ? `${item.element}: ` : ""}${item.detail}`))].join("\n").slice(0, 2_000);
  const renderChecks = adoptedDefects
    ? (() => {
        const layoutDefects = adoptedDefects.filter((item) => item.fixable);
        const readability = adoptedDefects.filter((item) => !item.fixable);
        return [
          { name: "rendered-layout" as const, status: layoutDefects.length ? "fail" as const : "pass" as const, severity: "warning" as const, detail: layoutDefects.length ? summarize(layoutDefects) : "390 · 926 · 1440px에서 넘침 · 줄바꿈 · 단 이탈 · 겹침이 없습니다." },
          { name: "rendered-readability" as const, status: readability.length ? "fail" as const : "pass" as const, severity: "warning" as const, detail: readability.length ? summarize(readability) : "글자 대비 · 서체 · 이미지 · 내용이 모두 보입니다." },
        ];
      })()
    : [];
  return {
    ...rendered,
    rationale: root.props.rationale,
    ungrounded,
    removed: [],
    usage,
    qaReport: {
      status: designChecks.some((check) => check.status === "fail" && check.severity === "error") ? "failed_qa" : "ready",
      checks: [
        { name: "has-markup", status: "pass", severity: "error", detail: "검증된 json-render Spec에서 렌더링했습니다." },
        {
          name: "grounded-numbers",
          status: ungrounded.length ? "fail" : "pass",
          severity: "warning",
          detail: ungrounded.length ? "수치 출처를 검토해 주세요." : "수치 출처 대조를 통과했습니다.",
        },
        ...designChecks,
        ...renderChecks,
      ],
    },
    manifest,
  };
}
