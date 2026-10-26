import { z } from "zod";
import {
  DEFAULT_PORTFOLIO_ARCHETYPE,
  PAGE_PROMPT_VERSION,
  STRUCTURED_DESIGN_FORMS,
  STRUCTURED_GROUP_TYPES,
  STRUCTURED_MAX_QUOTES,
  STRUCTURED_SCALES,
  STRUCTURED_SURFACES,
  STRUCTURED_WIDTHS,
  STRUCTURED_GROUP_CHILDREN,
  StructuredPortfolioContentSchema,
  archetypeComponents,
  isStructuredGroup,
  partialLeaves,
  structuredModelSchema,
  type PageGenerationManifest,
  type StructuredDesignPlan,
  type StructuredPortfolioContent,
} from "@expresso/contracts";
import { blueprintToken, describeArchetype, describeDesignLayout, designLayout, structuredCatalog, type BlueprintSlot } from "@expresso/portfolio-renderer";

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

/**
 * 설계 예산이 정하지 않는 칸의 글자 수 상한입니다. 채우기 출력 스키마와 청사진의 글 자리 길이가 함께 씁니다.
 * 섹션의 제목 · 요약 · 본문 길이와 항목 · 수치 개수는 설계의 칸 예산이 정합니다.
 */
export const FILL_LIMITS = {
  profile: { role: 60, headline: 72, focus: 30 },
  // 수치 값은 큰 글자로 그리므로 숫자와 단위만 담는 길이입니다("1,200만 건"이 8자). 설명은 이름표(label)와 설명(note)으로 갑니다.
  section: { period: 60, detailLabel: 20, detailText: 120, metricLabel: 40, metricValue: 10, metricNote: 80, stepLabel: 16, stepText: 60 },
  career: { period: 60, organization: 80, role: 80, description: 160, count: 8 },
  evidence: { title: 80, kind: 30, summary: 100, body: 300 },
} as const;

/**
 * 수치 값 · 이전 값의 모양입니다. 숫자가 들어 있고 공백은 단위 앞 한 번까지입니다("1.9초" · "420KB" · "1,200만 건").
 * "10만 행 끊김 없이 스크롤"처럼 설명이 붙은 값은 거절되어 채우기가 오류 문장을 받고 다시 씁니다.
 */
export const METRIC_VALUE_PATTERN = /^[^\s\d]{0,2}\d\S*(?: \S{1,3})?$/;

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
  /** 설계가 끝났을 때. 청사진을 그릴 내용(글 칸마다 표지)과 글 자리 목록을 함께 받습니다. */
  designed?: (input: { plan: StructuredDesignPlan; spec: unknown; blueprint: Blueprint }) => void;
  /** 채우는 동안 글 칸 하나의 글이 바뀌었을 때. 경로는 청사진 글 자리와 같습니다. */
  slot?: (path: string, text: string, done: boolean) => void;
  thinking?: (tokens: number) => void;
}

export interface Blueprint {
  content: StructuredPortfolioContent;
  slots: BlueprintSlot[];
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
      quote: "-",
      steps: [{ label: "-", text: "" }, { label: "-", text: "" }],
    })),
    career: [{ id: "career", period: "-", organization: "-", role: "-", description: "-" }],
    evidence: raw.evidence.length ? [{ id: "evidence", title: "-", kind: "-", summary: "-", body: "-" }] : [],
    contact: null,
  };
}

/**
 * 설계안대로 글 칸마다 표지를 넣은 청사진 내용입니다. 칸의 개수와 길이는 설계의 칸 예산과 `FILL_LIMITS`를 따르므로,
 * 채운 뒤의 지면과 같은 부품 · 같은 칸이 그려집니다. 경력은 채우기 전에는 몇 개인지 알 수 없어 한 줄만 둡니다.
 */
export function blueprintContent(plan: StructuredDesignPlan, context: PageGenerationContext): Blueprint {
  const raw = rawInput(context);
  const slots: BlueprintSlot[] = [];
  const slot = (path: string, chars: number) => {
    slots.push({ path, chars });
    return blueprintToken(slots.length - 1);
  };
  const text = (path: string, chars: number) => (chars > 0 ? slot(path, chars) : "");
  const count = (length: number) => Array.from({ length }, (_, index) => index);
  const evidenceIds = new Set(plan.evidence ? raw.evidence.map((item) => item.id) : []);
  const rawById = new Map(raw.sections.map((section) => [section.id, section]));
  const { profile: P, section: S, career: C, evidence: E } = FILL_LIMITS;
  const content: StructuredPortfolioContent = {
    version: 1,
    profile: {
      name: context.author!.name,
      role: slot("/profile/role", P.role),
      // 저장 계약은 마침표로 끝나는 한 문장을 요구합니다. 자리 길이는 그 규칙의 한글 36자입니다.
      headline: `${slot("/profile/headline", 36)}.`,
      intro: text("/profile/intro", plan.profile.intro),
      focus: count(plan.profile.focus).map((index) => slot(`/profile/focus/${index}`, P.focus)),
    },
    sections: plan.sections.filter((section) => section.include).map((section) => {
      const base = `/sections/${section.id}`;
      return {
        id: section.id,
        title: slot(`${base}/title`, section.budget.title),
        summary: text(`${base}/summary`, section.budget.summary),
        body: text(`${base}/body`, section.budget.body),
        pattern: section.pattern,
        details: count(section.budget.details).map((index) => ({ label: slot(`${base}/details/${index}/label`, S.detailLabel), text: slot(`${base}/details/${index}/text`, S.detailText) })),
        ...(section.budget.quote ? { quote: slot(`${base}/quote`, section.budget.quote) } : {}),
        ...(section.budget.steps ? { steps: count(section.budget.steps).map((index) => ({ label: slot(`${base}/steps/${index}/label`, S.stepLabel), text: slot(`${base}/steps/${index}/text`, S.stepText) })) } : {}),
        media: section.media.map((src) => ({ src, alt: raw.media.find((item) => item.src === src)?.alt || "-", origin: "uploaded" as const })),
        sourceIds: (rawById.get(section.id)?.sourceIds ?? []).filter((key) => evidenceIds.has(key)),
        ...(section.budget.metrics
          ? {
              metrics: count(section.budget.metrics).map((index) => ({
                label: slot(`${base}/metrics/${index}/label`, S.metricLabel),
                value: slot(`${base}/metrics/${index}/value`, S.metricValue),
                ...(section.form === "before-after" ? { before: slot(`${base}/metrics/${index}/before`, S.metricValue) } : {}),
              })),
            }
          : {}),
      };
    }),
    career: plan.career
      ? [{ id: "career-1", period: slot("/career/0/period", C.period), organization: slot("/career/0/organization", C.organization), role: slot("/career/0/role", C.role), description: slot("/career/0/description", C.description) }]
      : [],
    evidence: raw.evidence
      .filter((item) => evidenceIds.has(item.id))
      .map((item, index) => ({ id: item.id, title: slot(`/evidence/${index}/title`, E.title), kind: slot(`/evidence/${index}/kind`, E.kind), summary: slot(`/evidence/${index}/summary`, E.summary), body: slot(`/evidence/${index}/body`, E.body) })),
    contact: null,
  };
  return { content: StructuredPortfolioContentSchema.parse(content), slots };
}

/** 채우기 출력의 경로를 내용 경로로 옮깁니다. 프로필 칸만 이름이 다르고, 근거의 id는 글 칸이 아닙니다. */
function contentPath(path: readonly (string | number)[]): string | null {
  const [head] = path;
  if (head === "role" || head === "headline" || head === "intro" || head === "focus") return `/profile/${path.join("/")}`;
  if (head === "evidence" && path[2] === "id") return null;
  if (head === "sections" || head === "career" || head === "evidence") return `/${path.join("/")}`;
  return null;
}

/**
 * 채우기 출력 조각을 받아, 바뀐 글 칸만 경로 · 지금까지의 글 · 다 썼는지로 알립니다. 칸마다 전체 글을 보내므로
 * 공급자가 출력을 처음부터 다시 쓰면 쌓은 것만 버리고 이어 받으면 됩니다.
 */
function slotStream(notify: NonNullable<DesignFirstHooks["slot"]>) {
  let buffer = "";
  const sent = new Map<string, string>();
  const restart = () => { buffer = ""; };
  const push = (delta: string) => {
    buffer += delta;
    for (const leaf of partialLeaves(buffer)) {
      const path = contentPath(leaf.path);
      if (!path) continue;
      const state = `${leaf.closed ? "1" : "0"}${leaf.text}`;
      if (sent.get(path) === state) continue;
      sent.set(path, state);
      notify(path, leaf.text, leaf.closed);
    }
  };
  return { push, restart };
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
          // 크기 · 배경 · 폭입니다. 맞춤 단계가 Spec의 사례 요소 props(scale · surface · width)로 옮깁니다.
          emphasis: z.enum(STRUCTURED_SCALES),
          surface: z.enum(STRUCTURED_SURFACES),
          width: z.enum(STRUCTURED_WIDTHS),
          budget: z.object({
            title: z.number().int().min(8).max(60),
            summary: z.number().int().min(0).max(160),
            body: z.number().int().min(0).max(600),
            details: z.number().int().min(0).max(6),
            metrics: z.number().int().min(0).max(4),
            // 큰 인용(PullQuote)으로 보일 한 문장의 글자 수 · 과정 흐름(CaseFlow) 단계 수입니다. 쓰지 않으면 0입니다.
            quote: z.number().int().min(0).max(60),
            steps: z.number().int().min(0).max(6),
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
- 섹션마다 같은 모양(제목 · 본문 · 항목표)을 반복하지 않습니다. 이웃한 두 요소는 크기 · 배경 · 폭 · 컴포넌트 중 둘 이상이 달라야 합니다.
- 크기(emphasis): 대표 작업 1–2개만 lead입니다. lead는 사례 첫머리를 큰 번호와 큰 제목의 표지로 그립니다. 나머지는 standard, 짧게 지나가는 섹션은 compact입니다.
- 배경(surface): canvas=기본 바탕, field=디자인의 행동색 면, inverse=바탕색과 글자색을 뒤집은 면입니다. 지면에 field나 inverse를 1–3개 두어 흐름을 끊고, 이웃한 두 요소에 같은 색면을 잇지 않습니다. compact 섹션을 field로 두면 색면 강조 카드가 됩니다.
- 폭(width): content=본문 폭, bleed=창 폭 전체입니다. bleed는 색면 섹션 · 수치 띠 · 이미지 전시에 씁니다. 컨테이너 안의 요소는 bleed여도 본문 폭으로 그립니다.
- 출처에 이전 · 이후 수치가 있는 작업은 form=before-after와 CaseBeforeAfter로, 작업마다 대표 수치가 있으면 소개 바로 뒤에 MetricStrip을 둡니다. MetricStrip을 inverse나 field의 bleed 띠로 두면 첫 화면 아래에서 성과가 먼저 읽힙니다.
- 작업 순서 · 절차가 핵심인 작업은 form=flow와 CaseFlow입니다. budget.steps에 단계 수(2–6)를 정하면 채우는 단계가 단계 이름(${FILL_LIMITS.section.stepLabel}자)과 짧은 설명(${FILL_LIMITS.section.stepText}자)을 씁니다. 단계가 아니라 문제 · 작업 · 결과의 설명이면 form=process와 CaseProcess입니다.
- 제공 이미지가 핵심이면 form=showcase입니다. 이미지 한 장은 CaseShowcase(지면 폭의 큰 이미지), 여러 장은 CaseGallery입니다.
- 작업의 판단 · 원칙을 한 문장으로 보일 만하면 그 섹션의 budget.quote(30–60자)를 정하고 spec에 PullQuote(quote-1, quote-2)를 그 사례 앞이나 뒤에 둡니다. 지면에 ${STRUCTURED_MAX_QUOTES}개까지이고, 쓰지 않는 섹션은 budget.quote=0입니다.
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
첫 요소는 intro(NameIntro)입니다. 섹션마다 section-<id> 요소를 정확히 한 번 두고, 그 사례 유형은 plan의 form과 맞춥니다(before-after=CaseBeforeAfter, flow=CaseFlow, process=CaseProcess, showcase=CaseShowcase 또는 CaseGallery, technical=CaseTechnical, essay=CaseEssay 또는 skills · about이면 ContentPanel, row=CaseRow). 사례 요소의 scale · surface · width는 plan의 emphasis · surface · width로 맞춰지므로 plan에서 정합니다. MetricStrip · PullQuote의 scale · surface · width는 spec에서 정합니다. include=false인 섹션도 spec에는 두되 지면에서는 빠지므로, 컨테이너는 include=true인 요소로 짭니다.
${groups ? `컨테이너: ${describeGroupRules()} 컨테이너 안에 컨테이너를 넣지 않고, intro는 컨테이너에 넣지 않습니다.` : "모든 요소를 page.children에 바로 둡니다."}
rationale에는 이 지면을 이렇게 설계한 이유를 씁니다. motion은 'showcase'를 씁니다.`;
}

/** 섹션 하나를 채우는 출력 스키마입니다. 설계의 예산이 최대 길이가 됩니다. */
function sectionFillSchema(budget: StructuredDesignPlan["sections"][number]["budget"]) {
  const LIMIT = FILL_LIMITS.section;
  return z.object({
    title: z.string().min(1).max(budget.title),
    summary: z.string().max(Math.max(budget.summary, 0)),
    body: z.string().max(Math.max(budget.body, 0)),
    period: z.string().max(LIMIT.period).optional(),
    details: z.array(z.object({ label: z.string().min(1).max(LIMIT.detailLabel), text: z.string().min(1).max(LIMIT.detailText) })).max(budget.details),
    metrics: z
      .array(z.object({ label: z.string().min(1).max(LIMIT.metricLabel), value: metricValue(), before: metricValue().optional(), note: z.string().max(LIMIT.metricNote).optional() }))
      .max(budget.metrics),
    quote: z.string().max(Math.max(budget.quote ?? 0, 0)),
    steps: z.array(z.object({ label: z.string().min(1).max(LIMIT.stepLabel), text: z.string().max(LIMIT.stepText) })).max(budget.steps ?? 0),
  });
}

const metricValue = () =>
  z
    .string()
    .min(1)
    .max(FILL_LIMITS.section.metricValue)
    .regex(METRIC_VALUE_PATTERN, "수치 값은 숫자와 단위만 씁니다(예: 1.9초, 420KB, 1,200만 건). 무엇의 수치인지는 label에, 설명은 note에 씁니다.");

/** 채우기 프롬프트의 섹션 한 줄입니다. 설계의 칸 예산을 칸 이름과 글자 수 · 개수로 적습니다. */
function fillGuide(section: StructuredDesignPlan["sections"][number]) {
  const { budget } = section;
  return `  - ${section.id}: ${section.form} · ${section.emphasis} · 제목 ${budget.title}자 · 요약 ${budget.summary}자 · 본문 ${budget.body}자 · 항목 ${budget.details}개 · 수치 ${budget.metrics}개${budget.quote ? ` · 인용 ${budget.quote}자` : ""}${budget.steps ? ` · 단계 ${budget.steps}개` : ""}`;
}

/**
 * 채운 내용에 맞춰 Spec을 고칩니다. 부품의 조건(이미지 · 이전 값 · 단계 두 개 · 설명 두 개 · 수치 두 개 · 인용 문장)을 못 채운
 * 요소는 글 부품으로 내리거나 지우고, 뺀 섹션 · 근거 · 경력은 트리에서 지웁니다. 컨테이너가 자식 수 조건을 잃으면 풀어서
 * 자식을 페이지에 둡니다. 설계안을 주면 사례 요소의 크기 · 배경 · 폭을 설계안의 emphasis · surface · width로 맞춥니다.
 */
export function fitToContent(rawSpec: unknown, content: StructuredPortfolioContent, plan?: Pick<StructuredDesignPlan, "sections">) {
  const spec = structuredClone(rawSpec) as { root: string; elements: Record<string, { type: string; props: Record<string, unknown>; children: string[] }> };
  const sections = new Map(content.sections.map((section) => [section.id, section]));
  const stages = new Map((plan?.sections ?? []).map((section) => [section.id, section]));
  const remove = new Set<string>();
  const quoted = new Set<string>();
  for (const [key, node] of Object.entries(spec.elements)) {
    const binding = (node.props.section as { $state?: string } | undefined)?.$state;
    const id = binding?.match(/^\/sectionById\/(.+)$/)?.[1];
    // 큰 인용은 사례가 아니라 같은 섹션을 한 번 더 참조하는 요소입니다. 인용 문장이 없으면 지웁니다.
    if (node.type === "PullQuote") {
      const section = id ? sections.get(id) : undefined;
      if (!id || !section?.quote || quoted.has(id) || quoted.size >= STRUCTURED_MAX_QUOTES) remove.add(key);
      else quoted.add(id);
      continue;
    }
    if (id) {
      const section = sections.get(id);
      if (!section) { remove.add(key); continue; }
      if (node.type === "CaseBeforeAfter" && !section.metrics?.some((metric) => metric.before)) node.type = "CaseTechnical";
      if (node.type === "CaseGallery" && !section.media.length) node.type = "CaseEssay";
      if (node.type === "CaseShowcase" && !section.media.length) node.type = "CaseEssay";
      // 단계가 모자란 흐름은 설명 항목이 두 개 이상이면 과정형으로, 아니면 기사형으로 내립니다.
      if (node.type === "CaseFlow" && (section.steps?.length ?? 0) < 2) node.type = "CaseProcess";
      if (node.type === "CaseProcess" && section.details.length < 2) node.type = "CaseEssay";
      // 글 · 목록형의 사례 행은 같은 모양으로 이어 붙이므로 지면 변화를 두지 않습니다(모델 스키마에도 없음).
      const stage = node.type === "CaseRow" ? undefined : stages.get(id);
      if (stage)
        node.props = {
          ...node.props,
          scale: stage.emphasis,
          ...(stage.surface ? { surface: stage.surface } : {}),
          ...(stage.width ? { width: stage.width } : {}),
        };
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

export interface DesignFirstTuning {
  designTier?: "haiku" | "sonnet" | "opus";
  designEffort?: "low" | "medium" | "high";
  fillTier?: "haiku" | "sonnet" | "opus";
  fillEffort?: "low" | "medium" | "high";
}

/**
 * 설계 · 채우기의 모델과 생각량 기본값입니다. 2026-10-26 dev01 브루 · Linear Midnight 실측(설계 · 채움):
 * opus low · sonnet low 191초 $1.13(설계 끝 41초), sonnet low · sonnet low 222초 $0.80, opus medium · sonnet low 337초 $2.20,
 * 생각량 기본값(sonnet · sonnet) 421초. 출력 토큰의 대부분이 생각이라 low가 시간을 가장 많이 줄였고,
 * 설계는 opus가 sonnet보다 빨리 끝나 청사진이 먼저 뜹니다.
 */
export const DESIGN_FIRST_TUNING: DesignFirstTuning = { designTier: "opus", designEffort: "low", fillTier: "sonnet", fillEffort: "low" };

/**
 * 설계 → 채우기를 돌려 저장 계약에 맞는 내용과 Spec(모델 출력 형태, design 미포함)을 돌려줍니다.
 * 렌더 · 측정 · 결과 조립은 호출하는 생성기가 합니다.
 */
export async function designFirst(
  ai: AiClient,
  context: PageGenerationContext,
  hooks: DesignFirstHooks = {},
  /** 단계별 모델 티어와 생각량입니다. 주지 않은 값은 공급자 기본값입니다. 제품은 `DESIGN_FIRST_TUNING`을 씁니다. */
  tuning: DesignFirstTuning = {},
): Promise<DesignFirstResult> {
  const started = Date.now();
  if (!context.author?.name) throw new PageGenerationError("포트폴리오에 표시할 이름이 필요합니다.");
  const author = context.author.name;
  const raw = rawInput(context);
  if (!raw.sections.length) throw new PageGenerationError("설계할 섹션이 없습니다.");
  const usages: AiUsage[] = [];
  const calls: DesignFirstCall[] = [];
  const timeline: DesignFirstResult["timeline"] = [];
  const call = async <T>(contract: "page_design" | "page_fill", system: string, prompt: string, schema: z.ZodType<T>, slots?: ReturnType<typeof slotStream>) => {
    const result = await ai.complete(
      {
        contract, system, prompt, promptVersion: PAGE_PROMPT_VERSION,
        ...(contract === "page_design" && (tuning.designTier ?? context.modelTier) ? { modelTier: tuning.designTier ?? context.modelTier! } : {}),
        ...(contract === "page_fill" && tuning.fillTier ? { modelTier: tuning.fillTier } : {}),
        ...(contract === "page_design" && tuning.designEffort ? { effort: tuning.designEffort } : {}),
        ...(contract === "page_fill" && tuning.fillEffort ? { effort: tuning.fillEffort } : {}),
      },
      schema,
      { ...(hooks.thinking ? { onThinking: hooks.thinking } : {}), ...(slots ? { onPartial: slots.push, onPartialRestart: slots.restart } : {}) },
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
  if (hooks.designed) hooks.designed({ plan, spec: design.spec, blueprint: blueprintContent(plan, context) });

  // 2. 채우기 — 한 번의 호출로 모든 칸을 채웁니다. 호출마다 공급자 고정 비용(CLI 기본 프롬프트)이 들어
  //    섹션별 병렬 호출은 더 비싸고 빠르지도 않았습니다(2026-10-26 실측: 7회 · 약 $1.8).
  //    제품의 레시피 섹션은 기록과 연결(sourceIds)이 비어 있을 수 있어, 근거 원문은 모든 섹션이 함께 봅니다.
  const included = plan.sections.filter((section) => section.include);
  const sources = new Map(raw.evidence.map((item) => [item.id, item]));
  const rawById = new Map(raw.sections.map((section) => [section.id, section]));
  const evidenceText = raw.evidence.map((item) => `[${item.id}] ${item.label}\n${item.text.slice(0, FILL_SOURCE_CHARS)}`).join("\n\n");
  const fillSchema = z.object({
    role: z.string().min(1).max(FILL_LIMITS.profile.role),
    headline: z.string().min(1).max(FILL_LIMITS.profile.headline),
    intro: z.string().max(Math.max(plan.profile.intro, 0)),
    focus: z.array(z.string().min(1).max(FILL_LIMITS.profile.focus)).max(plan.profile.focus),
    sections: z.object(Object.fromEntries(included.map((section) => [section.id, sectionFillSchema(section.budget)]))),
    career: z.array(z.object({ period: z.string().max(FILL_LIMITS.career.period), organization: z.string().min(1).max(FILL_LIMITS.career.organization), role: z.string().max(FILL_LIMITS.career.role), description: z.string().max(FILL_LIMITS.career.description) })).max(plan.career ? FILL_LIMITS.career.count : 0),
    evidence: z.array(z.object({ id: z.enum(raw.evidence.length ? (raw.evidence.map((item) => item.id) as [string, ...string[]]) : ["-"]), title: z.string().min(1).max(FILL_LIMITS.evidence.title), kind: z.string().min(1).max(FILL_LIMITS.evidence.kind), summary: z.string().max(FILL_LIMITS.evidence.summary), body: z.string().max(FILL_LIMITS.evidence.body) })).max(plan.evidence ? raw.evidence.length : 0),
  });
  const fillPrompt = `## 지면 콘셉트
${plan.concept}
## 채울 칸
- 이름(${author}) 아래: 직무(role), 한 문장 headline(줄바꿈 없이 마침표 하나로 끝나는 한 문장, 한글 36자 이내, 직무와 구체적인 작업), 소개(intro, ${plan.profile.intro}자 이내, 0이면 빈 글), 집중 분야(focus, ${plan.profile.focus}개 이내).
- sections: 섹션마다 아래 설계의 글자 수 · 개수 안에서 채웁니다. 예산이 0이면 빈 글이나 빈 배열입니다. 수치(metrics)의 value · before는 출처에 적힌 숫자와 단위만 씁니다(예: "1.9초", "420KB", "1,200만 건"). 무엇의 수치인지는 label에, 조건 · 설명은 note에 씁니다. before-after 섹션은 이전 값(before)과 이후 값(value)을 함께 적습니다. process 섹션의 항목(details)은 과정의 단계를 순서대로 두 개 이상 적습니다. flow 섹션의 단계(steps)는 작업 순서대로 짧은 이름(label)과 한 줄 설명(text)입니다. 인용(quote)은 그 작업의 판단 · 원칙을 출처의 사실로 쓴 한 문장입니다.
${included.map(fillGuide).join("\n")}
${plan.career ? "- career: 출처에 있는 경력만 적습니다.\n" : ""}${plan.evidence ? "- evidence: 출처 자료를 지면용으로 짧게 적습니다.\n" : ""}## 출처
${JSON.stringify(included.map((section) => { const source = rawById.get(section.id)!; return { id: section.id, title: source.title, purpose: source.purpose, goal: source.goal, points: source.points }; }))}
${evidenceText}`;
  let filled: z.infer<typeof fillSchema> | null = null;
  let fillError = "";
  for (let attempt = 0; attempt < 2 && !filled; attempt++) {
    let output: z.infer<typeof fillSchema>;
    try {
      // 다시 받는 판은 처음부터 다시 흘러오므로 읽는 상태도 새로 만듭니다.
      output = await call("page_fill", FILL_SYSTEM, fillError ? `${fillPrompt}\n직전 출력의 검사 오류: ${fillError}\n수정한 전체 결과를 출력하세요.` : fillPrompt, fillSchema, hooks.slot ? slotStream(hooks.slot) : undefined);
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
      ...(output.quote.trim() ? { quote: output.quote.trim() } : {}),
      ...(output.steps.length ? { steps: output.steps } : {}),
    };
    return section;
  });
  const profilePart = { profile: { name: author, role: filled.role, headline: filled.headline, intro: filled.intro, focus: filled.focus }, career: filled.career, evidence: filled.evidence };
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
  return { plan, spec: fitToContent(design.spec, content, plan), content, usages, calls, timeline, prompt };
}
