import { createHash } from "node:crypto";
import { z } from "zod";
import {
  PAGE_PROMPT_VERSION,
  StructuredContentModelSchema,
  StructuredPortfolioContentSchema,
  structuredModelSchema,
  type StructuredContentModel,
  type StructuredPortfolioContent,
  type PageGenerationManifest,
} from "@expresso/contracts";
import {
  renderStructuredPortfolio,
  validateRenderableSpec,
  structuredCatalog,
  retrievePageLibrary,
  librarySelection,
} from "@expresso/portfolio-renderer";
import {
  AiError,
  type AiClient,
  type AiUsage,
} from "../../platform/ai/client.js";
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

/** 선택지 목록에서 출력 스키마의 원본 ID enum을 만듭니다. 생성기와 프롬프트가 같은 값을 씁니다. */
export function libraryChoices(
  library: ReturnType<typeof retrievePageLibrary>,
) {
  return {
    intro: library.intro.map((i) => i.renderKey || i.id),
    section: library.section.map((i) => i.renderKey || i.id),
    guidance: library.guidance.map((i) => i.id),
  };
}

export function structuredSpecPrompt(
  content: StructuredPortfolioContent,
  instruction = "",
  previous: unknown = null,
  library = retrievePageLibrary(content, instruction),
  schema: z.ZodType = structuredModelSchema(content, {
    ...libraryChoices(library),
    layout: "library",
  }),
): string {
  const choices = libraryChoices(library);
  // 요소 ID와 props 형태는 공급자에 넘기는 출력 스키마에서 만듭니다. 아래 문장은 스키마로 표현할 수 없는 규칙입니다.
  const format = describeSpecSchema(schema, [
    { values: choices.intro, label: "intro 선택지 ID" },
    { values: choices.section, label: "section 선택지 ID" },
    { values: choices.guidance, label: "guidance 선택지 ID" },
  ]);
  const ids = format.required;
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
  .map(([name, component]) => `${name}: ${component.description}`)
  .join("\n")}
전체 수집 목록 ${library.inventoryTotal}개를 검색 대상으로 사용했습니다. 실행할 수 있는 전체 선택지: ${JSON.stringify({ intro: library.intro.map((i) => ({ id: i.renderKey || i.id, name: i.name, description: i.reason })), section: library.section.map((i) => ({ id: i.renderKey || i.id, name: i.name, description: i.reason })), guidance: library.guidance.map((i) => ({ id: i.renderKey || i.id, name: i.name, categories: i.categories })) })}
NameIntro.props.sourceId는 intro 목록에서, 모든 사례 props.sourceId는 section 목록에서 선택합니다. ID를 반드시 지정합니다. 원본 React 코드를 입력 데이터에 연결합니다. 책/도록은 book, 항목 설명이 많은 자료는 feature, 간결한 설명은 card, 제목 강조는 text-gradient를 검토합니다. referenceIds에는 선택한 guidance ID 또는 []를 씁니다.
입력 특징: ${JSON.stringify({ profile: content.profile, sections: content.sections.map((section) => ({ id: section.id, title: section.title, summary: section.summary, pattern: section.pattern, bodyLength: section.body.length, images: section.media.length, imageDescriptions: section.media.map((item) => item.alt), details: section.details.map((item) => ({ label: item.label, excerpt: item.text.slice(0, 160) })) })), careerCount: content.career.length, evidenceCount: content.evidence.length, contact: !!content.contact })}
직무 이름만으로 어두운 색을 고르지 마세요. 이미지·본문 길이·설명 유형을 근거로 팔레트와 서체를 선택하고 rationale에 이유를 쓰세요. motion은 'showcase'를 씁니다. 자료마다 사례 유형을 독립적으로 선택합니다.
출력 형식(공급자에 넘기는 출력 스키마에서 생성):
${format.text}
모든 요소 ID를 트리 전체에서 정확히 한 번씩 연결합니다. 사용할 요소 ID: ${JSON.stringify(ids)}. 요소는 page.children에 바로 두거나 컨테이너의 children에 넣습니다. 첫 ID는 intro, 연락처가 있으면 마지막 ID는 contact이며 둘은 컨테이너에 넣지 않습니다.
컨테이너는 지면을 나누는 요소입니다. 요소 ID는 ${groupId}부터 차례로 쓰고, 각 컨테이너를 page.children에서 한 번 참조합니다. 컨테이너 안에 컨테이너를 넣지 않습니다. ${describeGroupRules()} 자료의 비중과 관계에 맞을 때만 쓰고, 쓰지 않아도 됩니다.
컨테이너 예: page.children=${JSON.stringify(example.page)}, elements["${groupId}"]=${JSON.stringify(example.group)}. 컨테이너에 넣은 ID는 page.children에 다시 쓰지 않습니다.
NameIntro는 첫 요소로 한 번 둡니다. 이름이 가장 크고 바로 아래 한 문장을 둡니다.
모든 section을 정확히 한 번, 알맞은 사례 타입으로 표시합니다. 이미지 없는 section에 CaseGallery를 쓰지 않습니다. CaseProcess에는 설명 두 개 이상이 필요합니다.
ProjectIndex는 필수이며 요소 ID는 index입니다. 소개 바로 다음에 두거나, variant='rail'로 Columns에 넣어 사례 옆 목차로 씁니다.
경력·근거·사례의 순서는 자유롭게 선택할 수 있습니다. contact가 있으면 마지막에 둡니다. 형식에 없는 속성, 경로, 텍스트를 props에 추가하지 마세요.
직전 Spec: ${JSON.stringify(previous)}
수정 요청: ${instruction || "자료를 읽기 좋은 구성으로 조립하세요."}
컨테이너 없이 쓰는 유효한 page.children 예시: ${JSON.stringify(ids)}. 첫 ID는 intro이며 마지막 ID는 ${content.contact ? "contact" : "자료에 맞는 요소"}입니다. 가운데 사례·경력·근거의 순서는 바꿀 수 있습니다. 연락처 뒤에 다른 요소를 추가하지 않습니다.`;
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

export class StructuredPageGenerator implements PageGenerator {
  constructor(private readonly ai: AiClient) {}
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
                "출처 자료에서 포트폴리오 표시용 내용을 정리합니다. 제공된 이름·섹션 ID·출처 ID를 그대로 사용합니다. 수치·성과·경력·연락처·이미지를 지어내지 않습니다. 이름 아래 headline은 직무와 구체적인 작업을 밝히는 짧은 한 문장입니다. 36자 안으로 작성합니다. 입력 자료의 개인정보는 필요한 표시 내용만 추립니다. 원본 전체를 evidence.body에 복사하지 않습니다.",
              prompt,
            },
            StructuredContentModelSchema,
            sink ? { onThinking: (tokens) => sink.thinking(tokens) } : {},
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
    const library = retrievePageLibrary(content, context.instruction);
    const choices = libraryChoices(library);
    const fixedLayout =
      context.style?.structure === "wide-margin"
        ? "editorial"
        : context.style?.structure === "dense-grid"
          ? "dossier"
          : context.style
            ? "library"
            : null;
    const schema = structuredModelSchema(content, {
      ...choices,
      layout: fixedLayout || "library",
    });
    const prompt =
      structuredSpecPrompt(
        content,
        context.instruction,
        context.previous?.structured?.spec,
        library,
        schema,
      ) +
      (context.style
        ? `\n사용자가 고른 스타일이 우선입니다. design.layout='${fixedLayout}', design.font='${context.style.font === "serif" ? "serif" : "sans"}'를 사용하세요. 색은 저장된 사용자 스타일에서 적용합니다.`
        : "");
    // 모델이 고칠 수 있는 Spec 검사 실패만 다시 요청합니다. 렌더링은 검사를 통과한 뒤 한 번만 합니다.
    const attempts: { output: unknown; error: string }[] = [];
    let accepted: {
      snapshot: ReturnType<typeof validateRenderableSpec>;
      root: Extract<
        ReturnType<typeof validateRenderableSpec>["spec"]["elements"][string],
        { type: "PortfolioPage" }
      >;
      attempt: number;
      usage: AiUsage;
    } | null = null;
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
        sink ? { onThinking: (tokens) => sink.thinking(tokens) } : {},
      );
      usages.push(result.usage);
      try {
        const snapshot = validateRenderableSpec(result.data, content);
        const root = snapshot.spec.elements[snapshot.spec.root]!;
        if (root.type !== "PortfolioPage")
          throw new Error("페이지 루트가 필요합니다.");
        if (
          context.style &&
          (root.props.design.layout !== fixedLayout ||
            root.props.design.font !==
              (context.style.font === "serif" ? "serif" : "sans"))
        )
          throw new Error("사용자가 고른 스타일을 보존해야 합니다.");
        accepted = { snapshot, root, attempt, usage: result.usage };
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
    let rendered: { html: string; css: string };
    try {
      rendered = renderStructuredPortfolio(
        snapshot.spec,
        snapshot.content,
        context.style,
      );
    } catch (error) {
      throw new PageRenderError(
        `지면 렌더링에 실패했습니다: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
    // 스트림 소비자는 기존 html/css 필드를 읽습니다. 완성된 검증 결과만 내보냅니다.
    sink?.delta(JSON.stringify(rendered));
    const usage = usages.reduce(
      (sum, item) => ({
        ...sum,
        inputTokens: sum.inputTokens + item.inputTokens,
        outputTokens: sum.outputTokens + item.outputTokens,
        cacheReadTokens: sum.cacheReadTokens + item.cacheReadTokens,
        cacheCreationTokens: sum.cacheCreationTokens + item.cacheCreationTokens,
        durationMs: sum.durationMs + item.durationMs,
        costUsd:
          sum.costUsd === null || item.costUsd === null
            ? null
            : sum.costUsd + item.costUsd,
      }),
      {
        ...accepted.usage,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        durationMs: 0,
        costUsd: 0 as number | null,
      },
    );
    const source = context.structuredContent
      ? JSON.stringify(context.structuredContent)
      : context.evidence.map((item) => item.text).join("\n");
    const ungrounded = ungroundedNumbers(
      visibleText(rendered.html),
      source,
    ).filter(
      (number) =>
        number.replace(/\D/g, "").length >= 2 && !isOrdinalLabel(number),
    );
    const { model: usageModel, ...manifestUsage } = usage;
    const manifest: PageGenerationManifest = {
      methodologyVersion: 1,
      model: usageModel,
      promptHash: createHash("sha256").update(prompt).digest("hex"),
      promptVersions: {
        page: PAGE_PROMPT_VERSION,
        designPrinciples: DESIGN_PRINCIPLES_VERSION,
      },
      tools: [],
      sourceUrls: librarySelection(snapshot.spec).selected.flatMap((item) =>
        item.sourceUrl ? [item.sourceUrl] : [],
      ),
      attempts: attempt + 1,
      repairCount: attempt,
      usage: manifestUsage,
      structured: snapshot,
      library: {
        ...librarySelection(snapshot.spec),
        query: library.query,
        offeredIds: [...choices.intro, ...choices.section, ...choices.guidance],
      },
    };
    return {
      ...rendered,
      rationale: root.props.rationale,
      ungrounded,
      removed: [],
      usage,
      qaReport: {
        status: "ready",
        checks: [
          {
            name: "has-markup",
            status: "pass",
            severity: "error",
            detail: "검증된 json-render Spec에서 렌더링했습니다.",
          },
          {
            name: "grounded-numbers",
            status: ungrounded.length ? "fail" : "pass",
            severity: "warning",
            detail: ungrounded.length
              ? "수치 출처를 검토해 주세요."
              : "수치 출처 대조를 통과했습니다.",
          },
        ],
      },
      manifest,
    };
  }
}
