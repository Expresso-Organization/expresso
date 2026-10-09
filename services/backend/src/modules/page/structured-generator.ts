import { createHash } from "node:crypto";
import {
  PAGE_PROMPT_VERSION,
  StructuredPortfolioContentSchema,
  structuredModelSchema,
  validateStructuredPortfolio,
  type StructuredPortfolioContent,
  type PageGenerationManifest,
} from "@expresso/contracts";
import {
  renderStructuredPortfolio,
  structuredCatalog,
  retrievePageLibrary,
  librarySelection,
} from "@expresso/portfolio-renderer";
import type { AiClient, AiUsage } from "../../platform/ai/client.js";
import { ungroundedNumbers, isOrdinalLabel } from "../../platform/numbers.js";
import {
  PageGenerationError,
  visibleText,
  DESIGN_PRINCIPLES_VERSION,
  type PageGenerator,
  type PageGenerationContext,
  type PageStreamSink,
  type GeneratedPageResult,
} from "./generator.js";

export function structuredSpecPrompt(
  content: StructuredPortfolioContent,
  instruction = "",
  previous: unknown = null,
  library = retrievePageLibrary(content, instruction),
): string {
  return `개인 포트폴리오의 json-render Spec을 작성하세요. HTML/CSS를 쓰지 않습니다.
${Object.entries(structuredCatalog.data.components)
  .map(([name, component]) => `${name}: ${component.description}`)
  .join("\n")}
전체 수집 목록 ${library.inventoryTotal}개를 검색 대상으로 사용했습니다. 실행할 수 있는 전체 선택지: ${JSON.stringify({ intro: library.intro.map((i) => ({ id: i.renderKey || i.id, name: i.name, description: i.reason })), section: library.section.map((i) => ({ id: i.renderKey || i.id, name: i.name, description: i.reason })), guidance: library.guidance.map((i) => ({ id: i.renderKey || i.id, name: i.name, categories: i.categories })) })}
NameIntro.props.sourceId는 intro 목록에서, 모든 사례 props.sourceId는 section 목록에서 선택합니다. ID를 반드시 지정합니다. 원본 React 코드를 입력 데이터에 연결합니다. 책/도록은 book, 항목 설명이 많은 자료는 feature, 간결한 설명은 card, 제목 강조는 text-gradient를 검토합니다. referenceIds에는 선택한 guidance ID 또는 []를 씁니다. 별도 스타일 요청이 없으면 design.layout='library'로 원본 컴포넌트의 내부 배치를 살립니다.
입력 특징: ${JSON.stringify({ profile: content.profile, sections: content.sections.map((section) => ({ id: section.id, title: section.title, summary: section.summary, pattern: section.pattern, bodyLength: section.body.length, images: section.media.length, imageDescriptions: section.media.map((item) => item.alt), details: section.details.map((item) => ({ label: item.label, excerpt: item.text.slice(0, 160) })) })), careerCount: content.career.length, evidenceCount: content.evidence.length, contact: !!content.contact })}
수집 원본의 내부 배치를 사용하므로 기본 골격은 library입니다. 사용자가 특정 스타일을 지정했을 때 editorial(측면 소개+기사), gallery(넓은 작품 전시), dossier(측면 목차+기술 상세)를 사용합니다. 팔레트는 ivory/cobalt/graphite/sage/burgundy, 서체는 serif/sans/mono입니다. 직무 이름만으로 어두운 색을 고르지 마세요. 이미지·본문 길이·설명 유형을 근거로 선택하고 rationale에 이유를 쓰세요.
원본 자료가 책·도록·작품처럼 이미지 자체가 성과를 보여주면 gallery에서 큰 이미지의 흐름을 살펴봅니다. 논리·해석이 주인공이면 editorial, 구조도·시험 절차·항목 비교를 탐색해야 하면 dossier가 적합합니다. 자료마다 사례 유형도 독립적으로 선택합니다.
children에는 다음의 모든 ID를 각각 한 번씩 연결합니다. 이 순서는 유효한 시작 예시이며 가운데 부분의 순서만 바꿀 수 있습니다: ${JSON.stringify(["intro", "index", ...content.sections.map((s) => `section-${s.id}`), ...(content.career.length ? ["career"] : []), ...(content.evidence.length ? ["evidence"] : []), ...(content.contact ? ["contact"] : [])])}. 첫 ID는 intro, 연락처가 있으면 마지막 ID는 contact입니다.
root='page'. PortfolioPage.props={profile:{$state:'/profile'},design:{layout,palette,font},motion:'showcase',rationale}.
NameIntro.props={profile:{$state:'/profile'},sections:{$state:'/sections'},sourceId:<선택 ID>}를 첫 요소로 한 번 둡니다. 이름이 가장 크고 바로 아래 한 문장을 둡니다.
모든 section을 정확히 한 번, CaseEssay/CaseGallery/CaseTechnical/CaseProcess/ContentPanel 중 알맞은 타입으로 표시합니다. props={section:{$state:'/sectionById/<입력 id>'},sourceId:<선택 ID>}. 이미지 없는 section에 CaseGallery를 쓰지 않습니다. CaseProcess에는 설명 두 개 이상이 필요합니다.
ProjectIndex는 필수이며 요소 ID는 index입니다. 소개 바로 다음에 index를 연결합니다. props={sections:{$state:'/sections'},variant:'rows'|'mosaic'|'rail'}.
입력 경력이 있으면 CareerTimeline.props={career:{$state:'/career'}}, 근거가 있으면 EvidenceGrid.props={evidence:{$state:'/evidence'}}를 한 번씩 둡니다. 경력·근거·사례의 순서는 자유롭게 선택할 수 있습니다. contact가 있으면 Contact.props={contact:{$state:'/contact'}}를 마지막에 둡니다. 없으면 생략합니다.
페이지의 children에는 실제 요소 ID를 넣고 각 하위 요소의 children은 []입니다. 다른 속성, 경로, 텍스트를 props에 추가하지 마세요.
직전 Spec: ${JSON.stringify(previous)}
수정 요청: ${instruction || "자료를 읽기 좋은 구성으로 조립하세요."}
유효한 page.children의 시작 예시: ${JSON.stringify(["intro", "index", ...content.sections.map((s) => `section-${s.id}`), ...(content.career.length ? ["career"] : []), ...(content.evidence.length ? ["evidence"] : []), ...(content.contact ? ["contact"] : [])])}. 모든 ID를 한 번씩 사용합니다. 첫 ID는 intro이며 마지막 ID는 ${content.contact ? "contact" : "자료에 맞는 요소"}입니다. 가운데 사례·경력·근거의 순서는 바꿀 수 있습니다. 연락처 뒤에 index나 다른 요소를 추가하지 않습니다.
출력 형식은 {root,elements}입니다.`;
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
      const { data, usage } = await this.ai.complete(
        {
          contract: "page_generation",
          promptVersion: PAGE_PROMPT_VERSION,
          ...(context.modelTier ? { modelTier: context.modelTier } : {}),
          system:
            "출처 자료에서 포트폴리오 표시용 내용을 정리합니다. 제공된 이름·섹션 ID·출처 ID를 그대로 사용합니다. 수치·성과·경력·연락처·이미지를 지어내지 않습니다. 이름 아래 headline은 직무와 구체적인 작업을 밝히는 짧은 한 문장입니다. 36자 안으로 작성합니다. 입력 자료의 개인정보는 필요한 표시 내용만 추립니다. 원본 전체를 evidence.body에 복사하지 않습니다. 연락처가 제공되지 않으면 contact=null입니다.",
          prompt: JSON.stringify(input),
        },
        StructuredPortfolioContentSchema,
        sink ? { onThinking: (tokens) => sink.thinking(tokens) } : {},
      );
      usages.push(usage);
      content = data;
      const expectedIds = input.sections.map((item) => item.id).sort();
      if (
        data.profile.name !== context.author.name ||
        JSON.stringify(data.sections.map((item) => item.id).sort()) !==
          JSON.stringify(expectedIds)
      )
        throw new PageGenerationError(
          "모델이 이름이나 입력 섹션을 변경했습니다.",
        );
      const sources = new Set(input.evidence.map((item) => item.id));
      if (data.evidence.some((item) => !sources.has(item.id)))
        throw new PageGenerationError(
          "모델이 제공되지 않은 근거를 추가했습니다.",
        );
      const provided = new Set(context.media.map((item) => item.src));
      if (
        data.sections.some((section) =>
          section.media.some(
            (item) => !provided.has(item.src) || item.origin !== "uploaded",
          ),
        )
      )
        throw new PageGenerationError(
          "모델이 제공되지 않은 이미지를 추가했습니다.",
        );
      if (data.contact)
        throw new PageGenerationError(
          "연락처 입력 경로가 없는 실행에서 연락처를 추가했습니다.",
        );
    }
    content = StructuredPortfolioContentSchema.parse(content);
    const library = retrievePageLibrary(content, context.instruction);
    const choices = {
      intro: library.intro.map((i) => i.renderKey || i.id),
      section: library.section.map((i) => i.renderKey || i.id),
      guidance: library.guidance.map((i) => i.id),
    };
    const fixedLayout =
      context.style?.structure === "wide-margin"
        ? "editorial"
        : context.style?.structure === "dense-grid"
          ? "dossier"
          : context.style
            ? "library"
            : null;
    const prompt =
      structuredSpecPrompt(
        content,
        context.instruction,
        context.previous?.structured?.spec,
        library,
      ) +
      (context.style
        ? `\n사용자가 고른 스타일이 우선입니다. design.layout='${fixedLayout}', design.font='${context.style.font === "serif" ? "serif" : "sans"}'를 사용하세요. 색은 저장된 사용자 스타일에서 적용합니다.`
        : "");
    const attempts: { output: unknown; error: string }[] = [];
    for (let attempt = 0; attempt < 2; attempt++) {
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
        structuredModelSchema(content, {
          ...choices,
          layout: fixedLayout || "library",
        }),
        sink ? { onThinking: (tokens) => sink.thinking(tokens) } : {},
      );
      usages.push(result.usage);
      try {
        const snapshot = validateStructuredPortfolio(result.data, content);
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
        const rendered = renderStructuredPortfolio(
          snapshot.spec,
          snapshot.content,
          context.style,
        );
        // 스트림 소비자는 기존 html/css 필드를 읽습니다. 완성된 검증 결과만 내보냅니다.
        sink?.delta(JSON.stringify(rendered));
        const usage = usages.reduce(
          (sum, item) => ({
            ...sum,
            inputTokens: sum.inputTokens + item.inputTokens,
            outputTokens: sum.outputTokens + item.outputTokens,
            cacheReadTokens: sum.cacheReadTokens + item.cacheReadTokens,
            cacheCreationTokens:
              sum.cacheCreationTokens + item.cacheCreationTokens,
            durationMs: sum.durationMs + item.durationMs,
            costUsd:
              sum.costUsd === null || item.costUsd === null
                ? null
                : sum.costUsd + item.costUsd,
          }),
          {
            ...result.usage,
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
          sourceUrls: librarySelection(snapshot.spec).selected.flatMap(
            (item) => (item.sourceUrl ? [item.sourceUrl] : []),
          ),
          attempts: attempt + 1,
          repairCount: attempt,
          usage: manifestUsage,
          structured: snapshot,
          library: {
            ...librarySelection(snapshot.spec),
            query: library.query,
            offeredIds: [
              ...choices.intro,
              ...choices.section,
              ...choices.guidance,
            ],
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
      } catch (error) {
        attempts.push({
          output: result.data,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    throw new PageGenerationError(
      `구성 계약 검사를 통과하지 못했습니다: ${attempts.at(-1)?.error}`,
    );
  }
}
