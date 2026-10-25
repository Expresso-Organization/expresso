import { z } from "zod";
import {
  DEFAULT_PORTFOLIO_ARCHETYPE,
  PAGE_PROMPT_VERSION,
  STRUCTURED_DESIGN_FORMS,
  STRUCTURED_GROUP_TYPES,
  STRUCTURED_GROUP_CHILDREN,
  StructuredPortfolioContentSchema,
  archetypeComponents,
  isStructuredGroup,
  structuredModelSchema,
  type PageGenerationManifest,
  type StructuredDesignPlan,
  type StructuredPortfolioContent,
} from "@expresso/contracts";
import { describeArchetype, describeDesignLayout, designLayout, structuredCatalog } from "@expresso/portfolio-renderer";

import { AiError, type AiClient, type AiUsage } from "../../platform/ai/client.js";
import { ungroundedNumbers } from "../../platform/numbers.js";
import { PageGenerationError, type PageGenerationContext } from "./generator.js";
import { describeGroupRules, describeSpecSchema } from "./structured-spec-format.js";

/**
 * 설계가 먼저 오는 생성.
 *
 * 지금까지는 내용 정리가 모든 글을 먼저 쓰고, 구성 선택이 그 글을 담을 칸을 골랐습니다. 그러면 어떤 디자인을 골라도
 * 섹션마다 제목 · 본문 · 항목표가 반복되는 문서가 됩니다. 여기서는 순서를 뒤집습니다.
 *
 * 1. 설계(`page_design`): 원자료를 보고 Spec과 칸 예산(섹션별 싣기 여부 · 시각 형태 · 글자 수)을 함께 정합니다.
 * 2. 채우기(`page_fill`): 한 번의 호출로, 예산을 출력 스키마의 최대 길이로 받아 원문에서 칸을 채웁니다.
 * 3. 맞춤: 채운 내용이 설계와 어긋나면(전후 비교인데 이전 값이 없음 등) 부품을 한 단계 내립니다.
 */

/** 설계 단계에 넘기는 근거 원문 길이입니다. 숫자 · 단계가 있는지 판단할 만큼만 넘깁니다. */
const DESIGN_SOURCE_CHARS = 1_500;
/** 채우기 단계에 넘기는 근거 원문 길이입니다. */
const FILL_SOURCE_CHARS = 4_000;

export interface DesignFirstCall {
  contract: string;
  model: string;
  durationMs: number;
  outputTokens: number;
  costUsd: number | null;
}

export interface DesignFirstResult {
  plan: StructuredDesignPlan;
  spec: unknown;
  content: StructuredPortfolioContent;
  usages: AiUsage[];
  calls: DesignFirstCall[];
  /** 생성 시작 기준 단계가 끝난 시각입니다. */
  timeline: NonNullable<PageGenerationManifest["timeline"]>;
  prompt: string;
}

export interface DesignFirstHooks {
  /** 설계가 끝났을 때. 청사진을 보내는 자리입니다. */
  designed?: (input: { plan: StructuredDesignPlan; spec: unknown }) => void;
  /** 섹션 하나 또는 프로필을 채웠을 때. */
  filled?: (input: { path: string; value: unknown }) => void;
  thinking?: (tokens: number) => void;
}

type RawSection = { id: string; title: string; purpose: string; goal: string; points: string[]; sourceIds: string[] };
type RawEvidence = { id: string; label: string; text: string };

const DESIGN_SYSTEM =
  "포트폴리오 지면을 설계하는 아트 디렉터입니다. 등록된 컴포넌트만으로 지면을 구성하고 칸마다 글자 수를 정합니다. 글은 쓰지 않습니다. 출처에 없는 수치나 성과를 전제로 설계하지 않습니다.";
const FILL_SYSTEM =
  "포트폴리오 지면의 정해진 칸을 출처 자료로 채웁니다. 칸의 글자 수를 넘기지 않고, 출처에 없는 수치 · 성과 · 경력 · 이미지를 만들지 않습니다. 출처의 표현을 짧게 다듬되 사실은 그대로 둡니다.";

function rawInput(context: PageGenerationContext) {
  const sections: RawSection[] = context.sections.map((section, index) => ({
    id: section.id ?? `section-${index + 1}`,
    title: section.title,
    purpose: section.purpose,
    goal: section.goal,
    points: section.points,
    sourceIds: section.sourceIds ?? [],
  }));
  const evidence: RawEvidence[] = context.evidence.map((item, index) => ({ id: item.id ?? `source-${index + 1}`, label: item.label, text: item.text }));
  return { sections, evidence, media: context.media };
}

/**
 * 설계 단계의 출력 스키마를 만드는 데 쓰는 골격 내용입니다. 글은 아직 없으므로 비우고, 고를 수 있는 부품이 열리도록
 * 이미지 · 이전 값 수치 자리만 둡니다. 실제로 쓸 수 있는지는 채운 뒤 `fitToContent`가 다시 맞춥니다.
 */
function skeleton(raw: ReturnType<typeof rawInput>, name: string): StructuredPortfolioContent {
  const image = raw.media[0];
  return {
    version: 1,
    profile: { name, role: "-", headline: "자리 표시입니다.", intro: "", focus: [] },
    sections: raw.sections.map((section) => ({
      id: section.id,
      title: section.title || "-",
      summary: "",
      body: "",
      pattern: "project" as const,
      details: [],
      media: image ? [{ src: image.src, alt: image.alt || "-", origin: "uploaded" as const }] : [],
      sourceIds: [],
      metrics: [{ label: "-", value: "1", before: "2" }, { label: "-", value: "1" }],
    })),
    career: [{ id: "career", period: "-", organization: "-", role: "-", description: "-" }],
    evidence: raw.evidence.length ? [{ id: "evidence", title: "-", kind: "-", summary: "-", body: "-" }] : [],
    contact: null,
  };
}

function designPlanSchema(sectionIds: [string, ...string[]], mediaCount: number) {
  return z.object({
    concept: z.string().min(1).max(300),
    profile: z.object({ intro: z.number().int().min(0).max(400), focus: z.number().int().min(0).max(6) }),
    sections: z
      .array(
        z.object({
          id: z.enum(sectionIds),
          include: z.boolean(),
          // 섹션의 성격입니다. project=작업 사례, about=자기소개, skills=역량 · 도구, career=경력 서술.
          pattern: z.enum(["project", "about", "skills", "career"]),
          form: z.enum(STRUCTURED_DESIGN_FORMS),
          emphasis: z.enum(["lead", "standard", "compact"]),
          budget: z.object({
            title: z.number().int().min(8).max(60),
            summary: z.number().int().min(0).max(160),
            body: z.number().int().min(0).max(600),
            details: z.number().int().min(0).max(6),
            metrics: z.number().int().min(0).max(4),
          }),
          /** 제공 이미지 번호(0부터)입니다. */
          media: z.array(z.number().int().min(0).max(Math.max(0, mediaCount - 1))).max(mediaCount ? 4 : 0),
        }),
      )
      .min(1)
      .max(16),
    evidence: z.boolean(),
    career: z.boolean(),
  });
}

function designPrompt(input: {
  raw: ReturnType<typeof rawInput>;
  author: string;
  context: PageGenerationContext;
  specSchema: z.ZodType;
}) {
  const { raw, context } = input;
  const archetype = context.archetype ?? DEFAULT_PORTFOLIO_ARCHETYPE;
  const layout = context.design ? designLayout(context.design) : null;
  const components = archetypeComponents(archetype, layout?.groups ?? STRUCTURED_GROUP_TYPES);
  const format = describeSpecSchema(input.specSchema);
  const groups = format.optional.some((key) => key.startsWith("group-"));
  return `## 목표
채용 담당자가 첫 화면 10초 안에 이 사람의 직무와 대표 성과를 읽는 포트폴리오 지면을 설계하세요. 문서가 아니라 지면입니다.
- 섹션마다 같은 모양(제목 · 본문 · 항목표)을 반복하지 않습니다. 대표 작업 1–2개는 emphasis=lead로 크게, 나머지는 standard나 compact로 짧게 둡니다.
- 출처에 이전 · 이후 수치가 있는 작업은 form=before-after와 CaseBeforeAfter로, 작업마다 대표 수치가 있으면 소개 바로 뒤에 MetricStrip을 둡니다. 과정이 핵심이면 form=process와 CaseProcess, 제공 이미지가 핵심이면 form=showcase와 CaseGallery입니다.
- 글은 짧게 정합니다. 본문(body) 예산은 lead 300자 이하, standard 160자 이하, compact 0–80자입니다. 요약은 60자 안팎입니다. 수치 칸(metrics)은 출처에 실제로 있는 수치 개수까지만 둡니다.
- 지면에 보탬이 되지 않는 섹션은 include=false로 뺍니다. 근거(evidence) · 경력(career)도 지면에 필요할 때만 true입니다.
- concept에는 지면 전체의 콘셉트를 한 문장으로 씁니다. 채우는 단계가 이 문장을 읽고 문체와 강조를 맞춥니다.

## 디자인
${layout ? describeDesignLayout(layout, context.design!.identity.name) : "색 · 서체 · 간격은 사용자가 고른 디자인 시스템이 정합니다."}
${describeArchetype(archetype)}

## 컴포넌트
${Object.entries(structuredCatalog.data.components)
  .filter(([name]) => components.includes(name))
  .map(([name, component]) => `${name}: ${component.description}`)
  .join("\n")}

## 자료
${JSON.stringify({
  author: input.author,
  plan: context.portfolioPlan,
  sections: raw.sections,
  evidence: raw.evidence.map((item) => ({ id: item.id, label: item.label, text: item.text.slice(0, DESIGN_SOURCE_CHARS) })),
  media: raw.media.map((item, index) => ({ index, alt: item.alt })),
})}

## 출력
plan과 spec을 함께 냅니다. plan.sections에는 자료의 모든 섹션을 한 번씩 적습니다.
spec 형식(공급자에 넘기는 출력 스키마에서 생성):
${format.text}
첫 요소는 intro(NameIntro)입니다. 섹션마다 section-<id> 요소를 정확히 한 번 두고, 그 사례 유형은 plan의 form과 맞춥니다(before-after=CaseBeforeAfter, process=CaseProcess, showcase=CaseGallery, technical=CaseTechnical, essay=CaseEssay 또는 skills · about이면 ContentPanel, row=CaseRow). include=false인 섹션도 spec에는 두되 지면에서는 빠지므로, 컨테이너는 include=true인 요소로 짭니다.
${groups ? `컨테이너: ${describeGroupRules()} 컨테이너 안에 컨테이너를 넣지 않고, intro는 컨테이너에 넣지 않습니다.` : "모든 요소를 page.children에 바로 둡니다."}
rationale에는 이 지면을 이렇게 설계한 이유를 씁니다. motion은 'showcase'를 씁니다.`;
}

/** 섹션 하나를 채우는 출력 스키마입니다. 설계의 예산이 최대 길이가 됩니다. */
function sectionFillSchema(budget: StructuredDesignPlan["sections"][number]["budget"]) {
  return z.object({
    title: z.string().min(1).max(budget.title),
    summary: z.string().max(Math.max(budget.summary, 0)),
    body: z.string().max(Math.max(budget.body, 0)),
    period: z.string().max(60).optional(),
    details: z.array(z.object({ label: z.string().min(1).max(20), text: z.string().min(1).max(120) })).max(budget.details),
    metrics: z
      .array(z.object({ label: z.string().min(1).max(40), value: z.string().min(1).max(24), before: z.string().min(1).max(24).optional(), note: z.string().max(80).optional() }))
      .max(budget.metrics),
  });
}

/**
 * 채운 내용에 맞춰 Spec을 고칩니다. 부품의 조건(이미지 · 이전 값 · 설명 두 개 · 수치 두 개)을 못 채운 요소는 한 단계 내리고,
 * 뺀 섹션 · 근거 · 경력은 트리에서 지웁니다. 컨테이너가 자식 수 조건을 잃으면 풀어서 자식을 페이지에 둡니다.
 */
export function fitToContent(rawSpec: unknown, content: StructuredPortfolioContent) {
  const spec = structuredClone(rawSpec) as { root: string; elements: Record<string, { type: string; props: Record<string, unknown>; children: string[] }> };
  const sections = new Map(content.sections.map((section) => [section.id, section]));
  const remove = new Set<string>();
  for (const [key, node] of Object.entries(spec.elements)) {
    const binding = (node.props.section as { $state?: string } | undefined)?.$state;
    const id = binding?.match(/^\/sectionById\/(.+)$/)?.[1];
    if (id) {
      const section = sections.get(id);
      if (!section) { remove.add(key); continue; }
      if (node.type === "CaseBeforeAfter" && !section.metrics?.some((metric) => metric.before)) node.type = "CaseTechnical";
      if (node.type === "CaseGallery" && !section.media.length) node.type = "CaseEssay";
      if (node.type === "CaseProcess" && section.details.length < 2) node.type = "CaseEssay";
    }
    if (node.type === "MetricStrip" && content.sections.flatMap((section) => section.metrics ?? []).length < 2) remove.add(key);
    if (node.type === "EvidenceGrid" && !content.evidence.length) remove.add(key);
    if (node.type === "CareerTimeline" && !content.career.length) remove.add(key);
  }
  for (const key of remove) delete spec.elements[key];
  const root = spec.elements[spec.root]!;
  const children: string[] = [];
  for (const key of root.children) {
    const node = spec.elements[key];
    if (!node) continue;
    if (!isStructuredGroup(node as never)) { children.push(key); continue; }
    node.children = node.children.filter((child) => spec.elements[child]);
    const [min] = STRUCTURED_GROUP_CHILDREN[node.type as (typeof STRUCTURED_GROUP_TYPES)[number]];
    if (node.children.length >= min) children.push(key);
    else { children.push(...node.children); delete spec.elements[key]; }
  }
  root.children = children;
  return spec;
}

/**
 * 설계 → 채우기를 돌려 저장 계약에 맞는 내용과 Spec(모델 출력 형태, design 미포함)을 돌려줍니다.
 * 렌더 · 측정 · 결과 조립은 호출하는 생성기가 합니다.
 */
export async function designFirst(
  ai: AiClient,
  context: PageGenerationContext,
  hooks: DesignFirstHooks = {},
  /** 단계별 생각량과 모델 티어입니다. 실측으로 정하려고 열어 둡니다. */
  tuning: { designEffort?: "low" | "medium" | "high"; fillEffort?: "low" | "medium" | "high"; fillTier?: "haiku" | "sonnet" | "opus" } = {},
): Promise<DesignFirstResult> {
  const started = Date.now();
  if (!context.author?.name) throw new PageGenerationError("포트폴리오에 표시할 이름이 필요합니다.");
  const author = context.author.name;
  const raw = rawInput(context);
  if (!raw.sections.length) throw new PageGenerationError("설계할 섹션이 없습니다.");
  const usages: AiUsage[] = [];
  const calls: DesignFirstCall[] = [];
  const timeline: DesignFirstResult["timeline"] = [];
  const call = async <T>(contract: "page_design" | "page_fill", system: string, prompt: string, schema: z.ZodType<T>) => {
    const result = await ai.complete(
      {
        contract, system, prompt, promptVersion: PAGE_PROMPT_VERSION,
        ...(contract === "page_design" && context.modelTier ? { modelTier: context.modelTier } : {}),
        ...(contract === "page_fill" && tuning.fillTier ? { modelTier: tuning.fillTier } : {}),
        ...(contract === "page_design" && tuning.designEffort ? { effort: tuning.designEffort } : {}),
        ...(contract === "page_fill" && tuning.fillEffort ? { effort: tuning.fillEffort } : {}),
      },
      schema,
      hooks.thinking ? { onThinking: hooks.thinking } : {},
    );
    usages.push(result.usage);
    calls.push({ contract, model: result.usage.model, durationMs: result.usage.durationMs, outputTokens: result.usage.outputTokens, costUsd: result.usage.costUsd });
    return result.data;
  };

  // 1. 설계 — 계약 위반이면 오류를 붙여 한 번 다시 받습니다.
  const archetype = context.archetype ?? DEFAULT_PORTFOLIO_ARCHETYPE;
  const layout = context.design ? designLayout(context.design) : null;
  const specSchema = structuredModelSchema(skeleton(raw, author), { intro: [], section: [], guidance: [], archetype, ...(layout ? { groups: layout.groups } : {}) });
  const sectionIds = raw.sections.map((section) => section.id) as [string, ...string[]];
  const schema = z.object({ plan: designPlanSchema(sectionIds, raw.media.length), spec: z.unknown() });
  const prompt = designPrompt({ raw, author, context, specSchema });
  let design: { plan: z.infer<ReturnType<typeof designPlanSchema>>; spec: unknown } | null = null;
  let lastError = "";
  for (let attempt = 0; attempt < 2 && !design; attempt++) {
    let output: z.infer<typeof schema>;
    try {
      output = await call(
        "page_design",
        DESIGN_SYSTEM,
        lastError ? `${prompt}\n직전 출력의 검사 오류: ${lastError}\n수정한 전체 결과를 출력하세요.` : prompt,
        z.object({ plan: designPlanSchema(sectionIds, raw.media.length), spec: specSchema }),
      ) as z.infer<typeof schema>;
    } catch (error) {
      if (error instanceof AiError && error.code === "AI_INVALID_OUTPUT") { lastError = error.message.slice(0, 2_000); continue; }
      throw error;
    }
    const planned = new Set(output.plan.sections.map((section) => section.id));
    if (planned.size !== sectionIds.length) { lastError = `plan.sections에 모든 섹션(${sectionIds.join(", ")})을 한 번씩 적어야 합니다.`; continue; }
    design = output;
  }
  if (!design) throw new PageGenerationError(`지면 설계가 계약 검사를 통과하지 못했습니다: ${lastError}`);
  const plan: StructuredDesignPlan = {
    ...design.plan,
    sections: design.plan.sections.map((section) => ({ ...section, media: section.media.map((index) => raw.media[index]!.src) })),
  };
  timeline.push({ stage: "designed", atMs: Date.now() - started });
  hooks.designed?.({ plan, spec: design.spec });

  // 2. 채우기 — 한 번의 호출로 모든 칸을 채웁니다. 호출마다 공급자 고정 비용(CLI 기본 프롬프트)이 들어
  //    섹션별 병렬 호출은 더 비싸고 빠르지도 않았습니다(2026-10-26 실측: 7회 · 약 $1.8).
  //    제품의 레시피 섹션은 기록과 연결(sourceIds)이 비어 있을 수 있어, 근거 원문은 모든 섹션이 함께 봅니다.
  const included = plan.sections.filter((section) => section.include);
  const sources = new Map(raw.evidence.map((item) => [item.id, item]));
  const rawById = new Map(raw.sections.map((section) => [section.id, section]));
  const evidenceText = raw.evidence.map((item) => `[${item.id}] ${item.label}\n${item.text.slice(0, FILL_SOURCE_CHARS)}`).join("\n\n");
  const fillSchema = z.object({
    role: z.string().min(1).max(60),
    headline: z.string().min(1).max(72),
    intro: z.string().max(Math.max(plan.profile.intro, 0)),
    focus: z.array(z.string().min(1).max(30)).max(plan.profile.focus),
    sections: z.object(Object.fromEntries(included.map((section) => [section.id, sectionFillSchema(section.budget)]))),
    career: z.array(z.object({ period: z.string().max(60), organization: z.string().min(1).max(80), role: z.string().max(80), description: z.string().max(160) })).max(plan.career ? 8 : 0),
    evidence: z.array(z.object({ id: z.enum(raw.evidence.length ? (raw.evidence.map((item) => item.id) as [string, ...string[]]) : ["-"]), title: z.string().min(1).max(80), kind: z.string().min(1).max(30), summary: z.string().max(100), body: z.string().max(300) })).max(plan.evidence ? raw.evidence.length : 0),
  });
  const fillPrompt = `## 지면 콘셉트
${plan.concept}
## 채울 칸
- 이름(${author}) 아래: 직무(role), 한 문장 headline(줄바꿈 없이 마침표 하나로 끝나는 한 문장, 한글 36자 이내, 직무와 구체적인 작업), 소개(intro, ${plan.profile.intro}자 이내, 0이면 빈 글), 집중 분야(focus, ${plan.profile.focus}개 이내).
- sections: 섹션마다 아래 설계의 글자 수 · 개수 안에서 채웁니다. 예산이 0이면 빈 글이나 빈 배열입니다. 수치(metrics)는 출처에 적힌 숫자와 단위만 쓰고, before-after 섹션은 이전 값(before)과 이후 값(value)을 함께 적습니다. process 섹션의 항목(details)은 과정의 단계를 순서대로 두 개 이상 적습니다.
${included.map((section) => `  - ${section.id}: ${section.form} · ${section.emphasis} · 제목 ${section.budget.title}자 · 요약 ${section.budget.summary}자 · 본문 ${section.budget.body}자 · 항목 ${section.budget.details}개 · 수치 ${section.budget.metrics}개`).join("\n")}
${plan.career ? "- career: 출처에 있는 경력만 적습니다.\n" : ""}${plan.evidence ? "- evidence: 출처 자료를 지면용으로 짧게 적습니다.\n" : ""}## 출처
${JSON.stringify(included.map((section) => { const source = rawById.get(section.id)!; return { id: section.id, title: source.title, purpose: source.purpose, goal: source.goal, points: source.points }; }))}
${evidenceText}`;
  let filled: z.infer<typeof fillSchema> | null = null;
  let fillError = "";
  for (let attempt = 0; attempt < 2 && !filled; attempt++) {
    let output: z.infer<typeof fillSchema>;
    try {
      output = await call("page_fill", FILL_SYSTEM, fillError ? `${fillPrompt}\n직전 출력의 검사 오류: ${fillError}\n수정한 전체 결과를 출력하세요.` : fillPrompt, fillSchema);
    } catch (error) {
      if (error instanceof AiError && error.code === "AI_INVALID_OUTPUT") {
        fillError = error.message.slice(0, 2_000);
        console.error(JSON.stringify({ level: "warn", event: "page.fill_retry", attempt, message: fillError.slice(0, 500) }));
        continue;
      }
      throw error;
    }
    const checked = StructuredPortfolioContentSchema.shape.profile.safeParse({ name: author, role: output.role, headline: output.headline, intro: output.intro, focus: output.focus });
    if (checked.success) filled = output;
    else fillError = checked.error.issues.map((issue) => issue.message).join("; ");
    if (!filled) console.error(JSON.stringify({ level: "warn", event: "page.fill_retry", attempt, message: fillError.slice(0, 500) }));
  }
  if (!filled) throw new PageGenerationError(`칸 채우기가 계약 검사를 통과하지 못했습니다: ${fillError}`);
  const groundSource = [JSON.stringify(raw.sections), evidenceText].join("\n");
  const sections = included.map((plannedSection) => {
    const output = (filled!.sections as Record<string, z.infer<ReturnType<typeof sectionFillSchema>>>)[plannedSection.id]!;
    // 출처에 없는 숫자가 들어간 수치는 버립니다.
    const metrics = output.metrics.filter((metric) => !ungroundedNumbers([metric.value, metric.before ?? ""].join(" "), groundSource).length);
    const section = {
      id: plannedSection.id,
      title: output.title,
      summary: output.summary,
      body: output.body,
      pattern: plannedSection.pattern,
      ...(output.period ? { period: output.period } : {}),
      details: output.details,
      media: plannedSection.media.map((src) => ({ src, alt: raw.media.find((item) => item.src === src)?.alt || output.title, origin: "uploaded" as const })),
      sourceIds: rawById.get(plannedSection.id)!.sourceIds,
      ...(metrics.length ? { metrics } : {}),
    };
    hooks.filled?.({ path: `/sections/${plannedSection.id}`, value: section });
    return section;
  });
  const profilePart = { profile: { name: author, role: filled.role, headline: filled.headline, intro: filled.intro, focus: filled.focus }, career: filled.career, evidence: filled.evidence };
  hooks.filled?.({ path: "/profile", value: profilePart.profile });
  timeline.push({ stage: "filled", atMs: Date.now() - started });

  // 3. 맞춤 — 근거에 없는 출처를 지우고, 부품 조건을 다시 맞춥니다.
  const evidence = profilePart.evidence.filter((item, index, list) => sources.has(item.id) && list.findIndex((other) => other.id === item.id) === index);
  const evidenceIds = new Set(evidence.map((item) => item.id));
  const content = StructuredPortfolioContentSchema.parse({
    version: 1,
    profile: profilePart.profile,
    sections: sections.map((section) => ({ ...section, sourceIds: section.sourceIds.filter((key) => evidenceIds.has(key)) })),
    career: profilePart.career.map((item, index) => ({ id: `career-${index + 1}`, ...item })),
    evidence,
    contact: null,
  });
  return { plan, spec: fitToContent(design.spec, content), content, usages, calls, timeline, prompt };
}
