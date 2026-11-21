import { createHash } from "node:crypto";
import { z } from "zod";
import { PAGE_PROMPT_VERSION, PageDraftSchema, pagePolicyPrompt, type DesignSystemSpecV2, type PageStyleGrammar, joinPageScripts } from "@expresso/contracts";

import type { AiClient, AiUsage } from "../../platform/ai/client.js";
import { sanitizePage } from "../../platform/html/sanitize.js";
import { isOrdinalLabel, ungroundedNumbers } from "../../platform/numbers.js";
import {
  DESIGN_PRINCIPLES_VERSION,
  PageGenerationError,
  SYSTEM,
  buildPrompt,
  markupProblem,
  pageQa,
  promptClosing,
  promptMedia,
  promptOpening,
  promptSources,
  ungroundedEmails,
  visibleText,
  type GeneratedPageResult,
  type PageGenerationContext,
  type PageGenerator,
  type PageSeed,
  type PageStreamSink,
} from "./generator.js";
import { designRules } from "./design-rules.js";
import { FRONTEND_DESIGN_SKILL } from "./design-skill/frontend-design.js";
import { briefGroundSource, briefPrompt, refinePageBrief, type PageBrief } from "./page-brief.js";

/**
 * 정리본과 디자인 지침을 받아 쓰는 자유 생성.
 *
 * `AiPageGenerator`에 두 가지를 따로 켤 수 있게 더했습니다.
 *
 * - `refine`: 지면을 쓰기 전에 원문에서 자료 정리본(`page-brief.ts`)을 만들고, 지면 호출은 원문 대신 정리본을 받습니다.
 * - `designSkill`: 디자인 지침 본문(예: `frontend-design` 스킬)을 시스템 프롬프트에 넣고, 계획을 `html`보다 먼저 적게 합니다.
 *
 * 이 생성기는 지면 키트(`.k-*` 부품)를 쓰지 않습니다. 모델이 CSS 전체를 씁니다. 디자인 시스템을 고른 포트폴리오에서 제품의 자유 생성은
 * `useKit: true`로 돌아 미리 만든 부품으로 조판하는데, 그러면 배치와 글자 다루기를 지침대로 정할 자리가 없습니다.
 *
 * 둘 다 끄면 키트를 끈 `AiPageGenerator`와 같은 시스템 프롬프트 · 같은 요청을 보냅니다. 어느 쪽이 효과를 내는지 가리려고 스위치를 나눴습니다
 * (`docs/architecture/portfolio-free-generation-lab.md`).
 */
export interface BriefedPageOptions {
  refine?: boolean;
  /** 디자인 지침 본문입니다. 비우면 지침을 넣지 않습니다. */
  designSkill?: string | null;
  /** 이미 만든 정리본입니다. 주면 정제 호출을 건너뜁니다(같은 입력의 여러 조건이 같은 정리본을 쓰게 합니다). */
  brief?: PageBrief | null;
  /**
   * 사용자가 고른 디자인을 지면 호출에 넘기는 방식입니다.
   *
   * - `grammar`(기본): 지금의 스타일 문법 그대로입니다. 색 · 서체 · 밀도와 함께 골격(단일 칼럼 · 격자 · 넓은 여백)을 규칙으로 줍니다.
   * - `tokens`: 색 · 서체 계열 · 밀도만 줍니다. 배치는 지면 호출이 정합니다.
   * - `spec`: 스타일 문법에 디자인 시스템 스펙(`context.design`)의 시각 규칙을 더합니다. 문법은 스펙을 줄인 것이라 시각 명제 ·
   *   대표 장치 · 색 역할 · 서체 단계 · 부품 규칙이 빠져 있습니다.
   */
  styleMode?: "grammar" | "tokens" | "spec";
}

const FONT_NAME = { sans: "고딕", serif: "명조", mono: "고정폭" } as const;
const DENSITY_NAME = { compact: "빽빽하게", comfortable: "읽기 편하게", spacious: "넓게" } as const;

/** 색 · 서체 계열 · 밀도만 적은 스타일 문단입니다. 골격과 구성은 적지 않습니다. */
export function styleTokensPrompt(style: PageStyleGrammar): string[] {
  return [
    "## 사용자가 고른 스타일 — 색 · 서체 · 밀도는 그대로 따른다",
    `고른 것: **${style.name}** — ${style.description}`,
    style.toneTags.length ? `성격: ${style.toneTags.join(" · ")}` : "",
    `- 바탕 \`${style.background}\` · 본문 글자 \`${style.text}\` · 강조 \`${style.accent}\`. 명도를 조절한 변주는 만들어 써도 되고, 계열 밖의 색은 들이지 않는다.`,
    `- 서체 계열: ${FONT_NAME[style.font]}. 한국어 대체 서체를 함께 지정한다.`,
    `- 밀도: ${DENSITY_NAME[style.density]}.`,
    "배치 · 단 구성 · 첫 화면의 모양은 스타일이 정하지 않았다. 이 사람의 자료를 보고 정한다.",
    "",
  ].filter((line, index, lines) => line !== "" || index === lines.length - 1);
}

const KIT_MEANING = {
  chrome: "면을 두르는 방식",
  marker: "이름표 앞의 표식",
  emphasis: "대표 수치를 세우는 방식",
  divider: "항목을 가르는 선",
} as const;

/** 디자인 시스템 스펙의 시각 규칙을 글로 폅니다. 부품별 내용 구성(`components`)은 싣지 않습니다 — 모든 사람의 첫 화면을 같은 순서로 묶습니다. */
export function designSpecPrompt(design: DesignSystemSpecV2): string[] {
  const { identity, colors, typography, spacing, shape, componentKit, composition, motion } = design;
  const color = (name: string, token: { value: string; role: string }) => `${name} \`${token.value}\`(${token.role})`;
  return [
    `## 고른 디자인 시스템 상세 — ${identity.name}`,
    `- 시각 명제: ${identity.visualThesis}`,
    `- 대표 장치: ${identity.signatureMoves.join(" · ")}`,
    `- 특징: ${identity.traits.join(" · ")}`,
    `- 색: ${[color("바탕", colors.canvas), color("면", colors.surface), color("올린 면", colors.elevated), color("글자", colors.text), color("보조 글자", colors.muted), color("경계", colors.border), color("강조", colors.accent), color("행동", colors.action)].join(" · ")}`,
    `- 서체: 제목 ${typography.display.family}(${typography.display.fallback}) · 본문 ${typography.body.family}(${typography.body.fallback}) · 수치 ${typography.mono.family}. 굵기 ${typography.weights.join(" · ")}, 본문 폭 ${typography.measure}.`,
    `- 글자 단계: ${typography.scale.map((step) => `${step.name} ${step.size}/${step.lineHeight}`).join(" · ")}`,
    `- 간격: 요소 ${spacing.elementGap}px · 부품 ${spacing.componentGap}px · 섹션 ${spacing.sectionGap}px · 지면 폭 ${spacing.contentWidth}px`,
    `- 모양: 모서리 ${shape.cardRadius}px · 테두리 ${shape.borderWidth}px · 그림자 ${shape.shadowStyle}`,
    `- 부품 규칙: ${(Object.keys(KIT_MEANING) as (keyof typeof KIT_MEANING)[]).map((key) => `${KIT_MEANING[key]} ${componentKit[key]}`).join(" · ")}`,
    `- 섹션 리듬: ${composition.sectionRhythm}`,
    `- 위계: ${composition.hierarchy}`,
    `- 면 쓰는 법: ${composition.surfaceStrategy}`,
    `- 모션: ${motion.personality} · ${motion.duration} ${motion.easing}`,
    "",
  ];
}

const DesignPlanSchema = z.strictObject({
  subject: z.string().min(1).describe("이 사람의 일에서 고른 지면의 소재"),
  palette: z.string().min(1).describe("이름 붙인 색 넷에서 여섯. 스타일 문법의 색에서 출발한다"),
  type: z.string().min(1).describe("서체와 각 서체의 역할, 크기 단계"),
  layout: z.string().min(1).describe("배치 개념 한 문장과 첫 화면 · 섹션별 배치"),
  signature: z.string().min(1).describe("이 지면에서 기억될 한 가지"),
  revised: z.string().describe("어느 지면에나 나올 기본값으로 읽혀 고친 부분과 이유"),
});
export type DesignPlan = z.infer<typeof DesignPlanSchema>;

/**
 * 계획 → CSS → HTML 순서로 적는 출력입니다. 키 순서가 쓰는 순서입니다.
 *
 * CSS를 HTML보다 먼저 받습니다. 이 지면은 키트가 없어서, HTML이 먼저 오면 생성 중 미리보기가 CSS가 올 때까지 꾸밈 없는 글만 보입니다.
 * CSS가 먼저 깔리면 지면이 위에서부터 제 모습으로 쓰입니다.
 */
const PlannedDraftSchema = z.strictObject({ plan: DesignPlanSchema, css: PageDraftSchema.shape.css, html: PageDraftSchema.shape.html, script: PageDraftSchema.shape.script, rationale: PageDraftSchema.shape.rationale });

/** 스킬 파일의 머리말(`---` 사이)을 뗍니다. */
export function skillBody(text: string): string {
  return text.replace(/^---\n[\s\S]*?\n---\n/, "").trim();
}

/**
 * 디자인 지침과 스타일 문법의 역할을 가릅니다.
 *
 * 지침은 "과감한 방향"을 요구하고 스타일 문법은 사용자가 고른 색 · 서체를 지키라고 합니다. 가르지 않으면 모델이 고른 색을 버립니다.
 * 지침 본문도 "의뢰서가 방향을 못 박았으면 그대로 따른다"고 적고 있어, 문법을 의뢰서로 읽게 합니다.
 */
const skillRole = (planLine: string) => [
  "## 디자인하는 법",
  "아래 「디자인 지침」이 이 지면을 디자인하는 방법이다. 지침이 말하는 의뢰서는 이 요청의 스타일과 자료 전체다.",
  "- 요청의 스타일이 정한 것은 의뢰서가 못 박은 방향이다. 그대로 따른다.",
  "- 스타일이 정하지 않은 자리에서 방향을 세운다 — 첫 화면에 무엇을 세울지, 섹션마다의 배치, 글자를 다루는 방식, 수치 · 과정 · 기간을 보이는 형태.",
  "- 주제는 이 사람이 하는 일이다. 그 일의 대상 · 도구 · 산출물에서 지면의 소재를 찾는다.",
  planLine,
  "- 반응은 CSS(`:hover` · `:focus` · `<details>` · 애니메이션)로 낸다. canvas · three.js 그림은 아래 「그림 스크립트」대로 `script`에 쓴다. 아래 「못 쓰는 것」이 지침보다 먼저다.",
  "- 지면의 글은 자료에 있는 사실로 쓴다. 지침의 문안 원칙은 그 글을 다듬는 데 쓴다.",
].join("\n");

const PLAN_LINE = "- 지침의 계획 → 검토를 `plan`에 먼저 적고, 그 계획대로 `html`과 `css`를 쓴다. 화면을 찍어 볼 수는 없다.";

const PLAN_OUTPUT = [
  "## 내는 순서",
  "- `plan` — 가장 먼저 쓴다. 소재 · 색 · 서체 · 배치 · 기억될 한 가지, 그리고 기본값으로 읽혀 고친 부분.",
  "- `css` — 계획대로 스타일 전부를 먼저 쓴다. 쓰는 동안 화면에 지면이 그려지므로, 뒤에 올 마크업의 클래스 이름을 여기서 정해 둔다.",
  "- `html` — 위에서 정한 클래스로 지면의 몸통을 쓴다.",
  "- `script` — 그림 스크립트. 그림이 필요 없으면 비운다.",
  "- `rationale` — 위 「내는 것」과 같다.",
].join("\n");

/**
 * 디자인 지침을 넣은 시스템 프롬프트입니다.
 *
 * `output`은 내는 순서를 적은 마지막 문단과 계획을 어디에 적는지의 한 줄입니다. 비우면 지면 전체를 쓰는 호출의 것
 * (`plan` → `css` → `html` → `rationale`)입니다. 첫 화면 한 장면만 그리는 호출(`design-chat/prompts.ts`)은 `plan` 칸이
 * 없어서 자기 것을 넘깁니다.
 */
export function briefedSystem(designSkill: string | null | undefined, output: { planLine: string; order: string } = { planLine: PLAN_LINE, order: PLAN_OUTPUT }): string {
  if (!designSkill) return SYSTEM;
  // 지면 정책을 지침 뒤에 한 번 더 둡니다. 지침이 권한 것 중 지면이 실을 수 없는 것(스크립트 · 바깥 이미지)을 마지막에 다시 읽게 합니다.
  return [SYSTEM, "", skillRole(output.planLine), "", "## 디자인 지침", skillBody(designSkill), "", pagePolicyPrompt({ script: true }), "", output.order].join("\n");
}

/**
 * 지시를 붙여 지금 지면을 고칠 때 덧붙이는 말입니다. 디자인 지침은 새 지면의 방향을 세우라고 하므로, 고치는 요청에서는
 * 지금 지면의 디자인을 그대로 두라고 따로 못 박습니다. 없으면 작은 지시에도 지면을 새로 디자인할 수 있습니다.
 */
const EDIT_NOTE = [
  "이번 요청은 지금 지면을 고치는 일이다. 지금 지면의 디자인(색 · 서체 · 배치 · 클래스 이름)과 글을 그대로 두고, 지시가 가리킨 것만 바꾼다.",
  "`plan`에는 지금 지면의 디자인을 그대로 요약하고, 지시로 달라지는 점을 `revised`에 적는다.",
];

/** 지시를 붙여 지금 지면을 고치는 요청인가. */
const isEdit = (context: PageGenerationContext) => Boolean(context.previous && context.instruction);

/** 고른 첫 화면을 이어 쓰는 요청인가. 지금 지면을 고칠 때는 직전 지면에 첫 화면이 이미 있어 쓰지 않습니다. */
const seedOf = (context: PageGenerationContext): PageSeed | null => (context.seed && !isEdit(context) ? context.seed : null);

/**
 * 고른 첫 화면의 스타일 문단입니다. 색 · 서체 계열 · 밀도는 첫 화면이 실제로 쓴 값입니다.
 * 스타일 문법(`context.style`)은 고정폭을 고딕으로 내려 두므로, 첫 화면이 있으면 문법 대신 이 값을 적습니다.
 */
export function seedStylePrompt(seed: PageSeed): string[] {
  return [
    "## 사용자가 고른 스타일 — 색 · 서체 · 밀도는 그대로 따른다",
    `고른 것: **${seed.name}**${seed.words ? ` — ${seed.words}` : ""}`,
    `- 바탕 \`${seed.tokens.background}\` · 본문 글자 \`${seed.tokens.text}\` · 강조 \`${seed.tokens.accent}\`. 명도를 조절한 변주는 만들어 써도 되고, 계열 밖의 색은 들이지 않는다.`,
    `- 서체 계열: ${FONT_NAME[seed.tokens.font]}. 한국어 대체 서체를 함께 지정한다.`,
    `- 밀도: ${DENSITY_NAME[seed.tokens.density]}.`,
    "",
  ];
}

/** 확정된 첫 화면과, 그 뒤만 쓰라는 지시입니다. */
export function seedPrompt(seed: PageSeed): string[] {
  return [
    "## 확정된 첫 화면 — 사용자가 대화에서 보고 고른 것이다",
    "이 첫 화면은 지면의 맨 앞에 그대로 놓인다. 다시 쓰지 않는다.",
    "```html",
    seed.html,
    "```",
    "```css",
    seed.css,
    "```",
    ...(seed.script ? ["```js", seed.script, "```"] : []),
    "",
    "- `html`에는 첫 화면 **바로 다음부터** 쓴다. 첫 화면에 이미 있는 이름 · 한 줄 소개 · 대표 사실을 되풀이하지 않고, 첫 화면에 싣지 않은 일을 섹션마다 디자인해 잇는다.",
    "- `css`에는 **새로 더하는 규칙만** 쓴다. 위 CSS는 이미 지면에 실려 있다. 위에 있는 선택자를 다시 정의하지 않고, 같은 색 · 서체 · 간격 단위 · 클래스 이름 짓는 법을 잇는다.",
    "- `script`에는 뒤 섹션의 그림에 필요한 스크립트만 쓴다. 첫 화면의 스크립트는 따로 도는 모듈로 이미 실려 있다 — 다시 쓰지 않고, 필요하면 `three`를 이 모듈에서 다시 불러온다.",
    "- `plan`에는 첫 화면의 디자인을 요약하고, 그 뒤를 어떻게 이을지를 적는다. 지면의 소재와 색 · 서체는 첫 화면이 정했다.",
    "",
    // 첫 화면만 디자인되고 그 뒤가 문단과 목록으로 돌아가면 사용자가 고른 것과 만든 것이 어긋난다. 첫 화면을 그릴 때와 같은 목록을 지킨다.
    "첫 화면 뒤의 섹션도 첫 화면을 디자인한 것과 같은 기준으로 만든다.",
    ...designRules("섹션"),
  ];
}

export function briefedPrompt(
  context: PageGenerationContext,
  brief: PageBrief | null,
  styleMode: BriefedPageOptions["styleMode"] = "grammar",
  /** 디자인 지침을 켠 요청인가. 고치는 요청에 디자인을 유지하라는 말을 덧붙입니다. */
  guided = false,
): string {
  const seed = seedOf(context);
  if (!brief && styleMode === "grammar" && !(guided && isEdit(context)) && !seed) return buildPrompt(context);
  const opening = seed
    ? [...promptOpening({ ...context, style: undefined }), ...seedStylePrompt(seed)]
    : styleMode === "tokens" && context.style
      ? [...promptOpening({ ...context, style: undefined }), ...styleTokensPrompt(context.style)]
      : [...promptOpening(context), ...(styleMode === "spec" && context.design ? designSpecPrompt(context.design) : [])];
  return [
    ...opening,
    ...(brief ? briefPrompt(brief) : promptSources(context)),
    ...promptMedia(context),
    ...(seed ? seedPrompt(seed) : []),
    ...promptClosing(context),
    ...(guided && isEdit(context) ? EDIT_NOTE : []),
  ].join("\n");
}

export interface BriefedPageResult extends GeneratedPageResult {
  brief: PageBrief | null;
  plan: DesignPlan | null;
  /** 정제 호출의 사용량입니다. 정제를 건너뛰었으면 null입니다. */
  briefUsage: AiUsage | null;
  system: string;
  prompt: string;
  /**
   * 모델이 지면에 쓴 스크립트 · 틀 · 양식 태그의 수입니다. 소독기는 허용하지 않는 태그를 지우면서 `removed`에 남기지 않으므로
   * (속성과 주소만 남깁니다) 따로 셉니다. 0이 아니면 지침이 권한 동작을 지면이 싣지 못한 것입니다.
   */
  blockedTags: number;
}

const BLOCKED_TAG = /<(script|iframe|form)\b/gi;

/**
 * 제품의 자유 생성입니다. 자료 정리본과 디자인 지침을 쓰고, 고른 디자인에서는 색 · 서체 계열 · 밀도만 넘깁니다.
 *
 * 2026-11-15 실험에서 여덟 조건 중 눈가림 품질 순위와 사람 사이의 다양성이 가장 높았던 조합입니다
 * (`docs/architecture/portfolio-free-generation-lab.md`). API와 Worker가 같은 조합을 쓰도록 여기 한 곳에 둡니다.
 */
export function freePageGenerator(ai: AiClient): BriefedPageGenerator {
  return new BriefedPageGenerator(ai, { refine: true, designSkill: FRONTEND_DESIGN_SKILL, styleMode: "tokens" });
}

export class BriefedPageGenerator implements PageGenerator {
  readonly #ai: AiClient;
  readonly #options: BriefedPageOptions;

  constructor(ai: AiClient, options: BriefedPageOptions = {}) {
    this.#ai = ai;
    this.#options = options;
  }

  /** 이 생성기의 지면은 키트를 쓰지 않습니다. 모델이 CSS 전체를 씁니다. */
  usesKit(): boolean {
    return false;
  }

  async generate(context: PageGenerationContext, sink: PageStreamSink | null = null): Promise<BriefedPageResult> {
    if (context.sections.length === 0) throw new PageGenerationError("만들 섹션이 없습니다");

    // 고른 첫 화면이 있으면 자료를 정리하기 전에 먼저 화면에 보냅니다. 정리에 30–50초가 들고(2026-11-19 측정),
    // 그동안 사람이 보는 것이 방금 고른 첫 화면이어야 합니다. 이어서 쓰이는 조각은 그 뒤에 붙습니다.
    const seed = seedOf(context);
    if (seed) sink?.seed?.({ html: seed.html, css: seed.css });

    let brief = this.#options.brief ?? null;
    let briefUsage: AiUsage | null = null;
    // 지시를 붙여 고칠 때는 다시 정리하지 않습니다. 내용은 직전 지면에 이미 있고, 원문 자료를 함께 넘깁니다.
    // 정리는 약 40초가 드는데 고치는 요청은 사람이 화면 앞에서 기다립니다.
    const refine = Boolean(this.#options.refine) && !isEdit(context);
    if (refine && !brief) {
      const refined = await refinePageBrief(this.#ai, context, PAGE_PROMPT_VERSION, sink ? (tokens) => sink.thinking(tokens) : undefined);
      brief = refined.brief;
      briefUsage = refined.usage;
    }
    if (!refine) brief = null;

    const skill = this.#options.designSkill ?? null;
    const system = briefedSystem(skill);
    const prompt = briefedPrompt(context, brief, this.#options.styleMode, Boolean(skill));
    // 정리본을 쓴 지면도 원문과 대조합니다. 정리본이 통과시킨 숫자만 믿지 않습니다.
    const source = brief ? briefGroundSource(context) : context.evidence.map(({ text }) => text).join("\n");
    const check = (draft: { html: string }) => {
      const problem = markupProblem(draft.html, false);
      if (problem) return [{ path: "/html", problem }];
      return ungroundedEmails(draft.html, source).map((email) => ({
        path: "/html",
        problem: `근거에 없는 이메일 ${email}이 지면에 있습니다. 이 사람의 연락처가 아닙니다. 그 이메일이 든 줄(이름표와 값, mailto 링크)을 지우고 다른 주소로 바꾸지 마세요.`,
      }));
    };
    const stream = sink ? { onPartial: (text: string) => sink.delta(text), onThinking: (tokens: number) => sink.thinking(tokens) } : {};
    const spec = { contract: "page_generation" as const, system, prompt, promptVersion: PAGE_PROMPT_VERSION, ...(context.modelTier ? { modelTier: context.modelTier } : {}) };

    let plan: DesignPlan | null = null;
    let draft: z.infer<typeof PageDraftSchema>;
    let usage: AiUsage;
    if (skill) {
      const result = await this.#ai.complete(spec, PlannedDraftSchema, { userId: context.userId, check, ...stream });
      ({ plan, ...draft } = result.data);
      usage = result.usage;
    } else {
      const result = await this.#ai.complete(spec, PageDraftSchema, { userId: context.userId, check, ...stream });
      draft = result.data;
      usage = result.usage;
    }

    // 지면 기록의 사용량은 이 지면을 만드는 데 든 호출 전부입니다. 정제 호출을 했으면 더합니다.
    if (briefUsage)
      usage = {
        ...usage,
        inputTokens: usage.inputTokens + briefUsage.inputTokens,
        outputTokens: usage.outputTokens + briefUsage.outputTokens,
        cacheReadTokens: usage.cacheReadTokens + briefUsage.cacheReadTokens,
        cacheCreationTokens: usage.cacheCreationTokens + briefUsage.cacheCreationTokens,
        durationMs: usage.durationMs + briefUsage.durationMs,
        costUsd: usage.costUsd === null || briefUsage.costUsd === null ? null : usage.costUsd + briefUsage.costUsd,
      };

    const written = sanitizePage(draft);
    // 첫 화면은 고른 것을 그대로 앞에 둡니다. 모델이 쓴 것은 그 뒤입니다.
    const clean = seed ? { ...written, html: `${seed.html}\n${written.html}`, css: `${seed.css}\n${written.css}` } : written;
    // 첫 화면의 스크립트와 이어 쓴 스크립트는 모듈을 따로 둔다(`PAGE_SCRIPT_BREAK`).
    const script = joinPageScripts(seed?.script, draft.script);
    const ungrounded = ungroundedNumbers(visibleText(clean.html), source).filter((number) => number.replace(/\D/g, "").length >= 2 && !isOrdinalLabel(number));
    return {
      html: clean.html,
      css: clean.css,
      ...(script ? { script } : {}),
      rationale: draft.rationale,
      ungrounded,
      removed: clean.removed,
      usage,
      qaReport: pageQa({ html: clean.html, useKit: false, ungrounded, portfolioPlan: context.portfolioPlan }),
      manifest: {
        methodologyVersion: 1,
        model: usage.model,
        promptHash: createHash("sha256").update(`${system}\0${prompt}`).digest("hex"),
        promptVersions: {
          page: PAGE_PROMPT_VERSION,
          designPrinciples: DESIGN_PRINCIPLES_VERSION,
          ...(context.style?.designReference ? { style: context.style.designReference.version } : {}),
        },
        tools: context.style?.designReference ? ["external-reference"] : [],
        sourceUrls: [...new Set([
          ...(context.portfolioPlan?.companyContext.flatMap(({ sourceUrl }) => (sourceUrl ? [sourceUrl] : [])) ?? []),
          ...(context.style?.designReference ? [context.style.designReference.sourceUrl] : []),
        ])],
        attempts: 1,
        repairCount: 0,
        usage: {
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          cacheReadTokens: usage.cacheReadTokens,
          cacheCreationTokens: usage.cacheCreationTokens,
          durationMs: usage.durationMs,
          costUsd: usage.costUsd,
        },
      },
      brief,
      plan,
      briefUsage,
      system,
      prompt,
      blockedTags: draft.html.match(BLOCKED_TAG)?.length ?? 0,
    };
  }
}
