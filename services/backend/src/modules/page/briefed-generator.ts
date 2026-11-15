import { createHash } from "node:crypto";
import { z } from "zod";
import { PAGE_PROMPT_VERSION, PageDraftSchema, pagePolicyPrompt } from "@expresso/contracts";

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
  ungroundedEmails,
  visibleText,
  type GeneratedPageResult,
  type PageGenerationContext,
  type PageGenerator,
  type PageStreamSink,
} from "./generator.js";
import { briefGroundSource, briefPrompt, refinePageBrief, type PageBrief } from "./page-brief.js";

/**
 * 정리본과 디자인 지침을 받아 쓰는 자유 생성.
 *
 * `AiPageGenerator`에 두 가지를 따로 켤 수 있게 더했습니다.
 *
 * - `refine`: 지면을 쓰기 전에 원문에서 자료 정리본(`page-brief.ts`)을 만들고, 지면 호출은 원문 대신 정리본을 받습니다.
 * - `designSkill`: 디자인 지침 본문(예: `frontend-design` 스킬)을 시스템 프롬프트에 넣고, 계획을 `html`보다 먼저 적게 합니다.
 *
 * 둘 다 끄면 `AiPageGenerator`와 같은 시스템 프롬프트 · 같은 요청을 보냅니다. 어느 쪽이 효과를 내는지 가리려고 스위치를 나눴습니다
 * (`docs/architecture/portfolio-free-generation-lab.md`).
 */
export interface BriefedPageOptions {
  refine?: boolean;
  /** 디자인 지침 본문입니다. 비우면 지침을 넣지 않습니다. */
  designSkill?: string | null;
  /** 이미 만든 정리본입니다. 주면 정제 호출을 건너뜁니다(같은 입력의 여러 조건이 같은 정리본을 쓰게 합니다). */
  brief?: PageBrief | null;
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

/** 계획을 `html`보다 먼저 적는 출력입니다. 키 순서가 쓰는 순서입니다. */
const PlannedDraftSchema = z.strictObject({ plan: DesignPlanSchema, ...PageDraftSchema.shape });

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
const SKILL_ROLE = [
  "## 디자인하는 법",
  "아래 「디자인 지침」이 이 지면을 디자인하는 방법이다. 지침이 말하는 의뢰서는 이 요청의 스타일 문법과 자료 전체다.",
  "- 스타일 문법이 고른 색 · 서체 계열 · 밀도 · 골격은 의뢰서가 못 박은 방향이다. 그대로 따른다.",
  "- 문법이 정하지 않은 자리에서 방향을 세운다 — 첫 화면에 무엇을 세울지, 섹션마다의 배치, 글자를 다루는 방식, 수치 · 과정 · 기간을 보이는 형태.",
  "- 주제는 이 사람이 하는 일이다. 그 일의 대상 · 도구 · 산출물에서 지면의 소재를 찾는다.",
  "- 지침의 계획 → 검토를 `plan`에 먼저 적고, 그 계획대로 `html`과 `css`를 쓴다. 화면을 찍어 볼 수는 없다.",
  "- 움직임과 반응은 CSS(`:hover` · `:focus` · `<details>` · 애니메이션)로 낸다. 아래 「못 쓰는 것」이 지침보다 먼저다.",
  "- 지면의 글은 자료에 있는 사실로 쓴다. 지침의 문안 원칙은 그 글을 다듬는 데 쓴다.",
].join("\n");

const PLAN_OUTPUT = [
  "## 내는 순서",
  "- `plan` — `html`보다 먼저 쓴다. 소재 · 색 · 서체 · 배치 · 기억될 한 가지, 그리고 기본값으로 읽혀 고친 부분.",
  "- `html` · `css` · `rationale` — 위 「내는 것」과 같다.",
].join("\n");

export function briefedSystem(designSkill: string | null | undefined): string {
  if (!designSkill) return SYSTEM;
  // 지면 정책을 지침 뒤에 한 번 더 둡니다. 지침이 권한 것 중 지면이 실을 수 없는 것(스크립트 · 바깥 이미지)을 마지막에 다시 읽게 합니다.
  return [SYSTEM, "", SKILL_ROLE, "", "## 디자인 지침", skillBody(designSkill), "", pagePolicyPrompt(), "", PLAN_OUTPUT].join("\n");
}

export function briefedPrompt(context: PageGenerationContext, brief: PageBrief | null): string {
  if (!brief) return buildPrompt(context);
  return [...promptOpening(context), ...briefPrompt(brief), ...promptMedia(context), ...promptClosing(context)].join("\n");
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

export class BriefedPageGenerator implements PageGenerator {
  readonly #ai: AiClient;
  readonly #options: BriefedPageOptions;

  constructor(ai: AiClient, options: BriefedPageOptions = {}) {
    this.#ai = ai;
    this.#options = options;
  }

  async generate(context: PageGenerationContext, sink: PageStreamSink | null = null): Promise<BriefedPageResult> {
    if (context.sections.length === 0) throw new PageGenerationError("만들 섹션이 없습니다");

    let brief = this.#options.brief ?? null;
    let briefUsage: AiUsage | null = null;
    if (this.#options.refine && !brief) {
      const refined = await refinePageBrief(this.#ai, context, PAGE_PROMPT_VERSION);
      brief = refined.brief;
      briefUsage = refined.usage;
    }
    if (!this.#options.refine) brief = null;

    const skill = this.#options.designSkill ?? null;
    const system = briefedSystem(skill);
    const prompt = briefedPrompt(context, brief);
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

    const clean = sanitizePage(draft);
    const ungrounded = ungroundedNumbers(visibleText(clean.html), source).filter((number) => number.replace(/\D/g, "").length >= 2 && !isOrdinalLabel(number));
    return {
      html: clean.html,
      css: clean.css,
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
