import { createHash } from "node:crypto";

import {
  PAGE_PROMPT_VERSION,
  PageDraftSchema,
  PAGE_KIT_CSS,
  pageKitPrompt,
  pagePolicyPrompt,
  pageStyleGrammarPrompt,
  type PageGenerationManifest,
  type PageQaReport,
  type PageStyleGrammar,
  type PortfolioPlan,
} from "@expresso/contracts";

import { AiError, type AiClient, type AiModelTier, type AiUsage } from "../../platform/ai/client.js";
import { PageSanitizeError, sanitizePage } from "../../platform/html/sanitize.js";
import { inlineSizedClasses, unstyledClasses } from "../../platform/html/unstyled.js";
import { ungroundedNumbers } from "../../platform/numbers.js";

/**
 * 지면을 통째로 만든다.
 *
 * 블록을 쓰고 배치를 따로 짜던 길과 다르다 — 한 번의 호출이 **글과 지면을 함께**
 * 낸다. 나눠서 얻던 것들(문장 고정 · 부분 재생성 · 같은 내용 3안 비교)을 포기하는
 * 대신, 모델이 CSS 전부를 쓴다.
 *
 * 우리가 남긴 것은 셋이다 — **소독**(방문자 보호), **근거 대조**(지어낸 성과 차단),
 * 그리고 **프롬프트**. 품질은 이제 거의 전부 마지막 하나에 달려 있다.
 */

export interface PageEvidence {
  label: string;
  text: string;
}

export interface PageSection {
  title: string;
  purpose: string;
  goal: string;
  points: string[];
  targetLength: number;
}

export interface PageMedia {
  /** 지면이 그대로 쓸 주소. 소독기가 이 접두어만 통과시킨다. */
  src: string;
  srcSet: string;
  alt: string;
  width: number;
  height: number;
}

export interface PageGenerationContext {
  /** 1단계에서 확정한 내용 계약. 원문을 다시 해석하는 대신 이 설계를 표현한다. */
  portfolioPlan: PortfolioPlan | null;
  /**
   * 사용자가 **생성 전에 고른** 스타일 문법.
   *
   * 이 플랫폼이 여러 장 뽑아 고르게 하지 않는 이유가 이것이다 — 뽑기 전에
   * 성격을 정해 두면 한 장으로 충분하다. 없으면(옛 포트폴리오) 모델이 알아서 정한다.
   */
  style?: PageStyleGrammar | undefined;
  sections: PageSection[];
  evidence: PageEvidence[];
  media: PageMedia[];
  jobTitle: string | null;
  company: {
    name: string;
    industry: string | null;
    toneSummary: string | null;
    brandColors: string[];
  } | null;
  /** 다시 뽑을 때만. "더 차분하게" · "첫 화면을 크게". */
  instruction?: string | undefined;
  /** 다시 뽑을 때 직전 지면. 지시가 건드리지 않은 것은 그대로 두게 한다. */
  previous?: { html: string; css: string } | undefined;
  /**
   * 키트를 쓸 것인가.
   *
   * 문법이 있어야 켤 수 있다 — 키트 전체가 문법의 변수를 먹고 돌기 때문이다.
   */
  useKit?: boolean | undefined;
  /**
   * 티어를 덮어쓴다.
   *
   * 키트를 쓰면 모델이 하는 일이 "디자인 시스템을 발명하라"에서 "있는 부품으로
   * 조판하라"로 바뀐다. 그러면 더 싼 티어로도 버틸 수 있는지가 이 경로에서
   * 값을 낼 유일한 자리라 열어 둔다.
   */
  modelTier?: AiModelTier | undefined;
}

export interface GeneratedPageResult {
  html: string;
  css: string;
  rationale: string;
  /**
   * 근거에서 확인하지 못한 수. 한 번 수정한 뒤에도 남으면 failed_qa 초안으로
   * 보존하고 공개 문서 경로에서는 제외한다.
   */
  ungrounded: string[];
  /** 소독기가 지운 것. 비어 있어야 정상이다. */
  removed: string[];
  /** 이 지면 한 장에 들어간 값. 비용을 재려면 셀 수 있어야 한다. */
  usage: AiUsage;
  qaReport: PageQaReport;
  manifest: PageGenerationManifest;
}

export interface PageGenerator {
  generate(context: PageGenerationContext): Promise<GeneratedPageResult>;
}

export class PageGenerationError extends Error {
  constructor(message: string, options: { cause?: unknown } = {}) {
    super(message, options.cause === undefined ? {} : { cause: options.cause });
    this.name = "PageGenerationError";
  }
}

/**
 * 키트를 쓸 때의 시스템 프롬프트.
 *
 * 짧아진 것이 핵심이 아니라 **일이 바뀐 것**이 핵심이다. "디자인 시스템을 만들고
 * 그 위에 지면을 짜라"에서 "있는 부품으로 이 사람을 조판하라"로.
 */
const SYSTEM_KIT = [
  "너는 이직 지원자의 **포트폴리오 웹페이지 한 장**을 조판한다.",
  "글도 네가 쓰고 구성도 네가 정한다. 다만 **부품은 이미 만들어져 있다.**",
  "",
  "## 목표",
  "채용 담당자가 스크롤하며 읽는 페이지다. 무엇을 어떤 순서로 어떻게 강조할지가",
  "네 일이다. 색 · 서체 · 간격 · 애니메이션은 키트와 문법이 이미 정했다.",
  "",
  pageKitPrompt(),
  "",
  pagePolicyPrompt(),
  "",
  "## 사실 — 여기서 어기면 지원자가 다친다",
  "**주어진 근거에 있는 것만 쓴다.** 근거에 없는 숫자 · 회사명 · 프로젝트를 지어내지 마라.",
  "숫자는 근거에 적힌 **그 형태 그대로** 옮긴다 — 220분을 '3시간 40분'으로 환산하지 마라.",
  "",
  "## 글",
  "- 첫 화면에서 이 사람이 뭘 하는 사람인지 알게 한다.",
  "- 숫자로 말한다. '성능을 크게 개선' 대신 '220분 → 24분'.",
  "- 섹션마다 **주장을 담은 한 줄**(`.k-lede`)을 세운다. 이름만 덩그러니 두지 마라.",
  "  '새벽 4시에 시작한 배치가 오전 업무까지 물리던 문제'처럼.",
  "- '~하였습니다', '~라고 할 수 있습니다'를 쓰지 않는다.",
  "",
  "## 내는 것",
  "- `html` — 몸통. `<!doctype>` · `<html>` · `<head>` · `<body>`는 쓰지 않는다.",
  "  최상위는 `<div class=\"k-page k-page--<골격>\">`이다.",
  "- `css` — **이 지면만의 한 장면**에 쓰는 것만. 부품을 다시 만들지 마라.",
  "  비어 있어도 된다. 길어질수록 키트를 안 쓰고 있다는 뜻이다.",
  "- `rationale` — 이 내용을 보고 내린 판단을 한 문장으로.",
].join("\n");

const SYSTEM = [
  "너는 이직 지원자의 **포트폴리오 웹페이지 한 장**을 만든다.",
  "글도 네가 쓰고 지면도 네가 짠다.",
  "",
  "## 목표",
  "채용 담당자가 스크롤하며 읽는 페이지다. **읽히면서 잘 만들어 보여야 한다.**",
  "구성 · 그래프 · 강조는 네가 정한다. 다만 **스타일 문법이 함께 오면 그것이 먼저다** —",
  "사용자가 생성 전에 고른 값이고, 네 취향으로 덮을 수 없다.",
  "SVG를 직접 그려도 되고, CSS 애니메이션을 넣어도 된다.",
  "",
  pagePolicyPrompt(),
  "",
  "## 사실 — 여기서 어기면 지원자가 다친다",
  "**주어진 근거에 있는 것만 쓴다.** 근거에 없는 숫자 · 회사명 · 프로젝트를 지어내지 마라.",
  "숫자는 근거에 적힌 **그 형태 그대로** 옮긴다 — 220분을 '3시간 40분'으로 환산하지 마라.",
  "",
  "## 내는 것",
  "- `html` — 지면의 몸통. `<!doctype>` · `<html>` · `<head>` · `<body>`는 **쓰지 않는다.**",
  "  껍데기는 우리가 씌운다. `<link>`가 필요하면 몸통 맨 앞에 둬라.",
  "- `css` — 그 마크업에 붙을 스타일 전부.",
  "- `rationale` — 왜 이렇게 만들었는지 한 문장. 어느 지면에나 붙는 말 말고,",
  "  이 내용을 보고 내린 판단을 쓴다.",
  "",
  "클래스 이름은 네가 짓는다. `pf-`로 시작하는 이름만 쓰지 마라(껍데기가 쓴다).",
  "",
  "## 두 가지만 조심하면 된다",
  "- **크기를 주는 요소에는 `display`를 명시한다.** `<span>` 같은 inline 태그는",
  "  `width`·`height`가 먹지 않아 화면에서 사라진다. 막대 · 트랙 · 타일은",
  "  `display:block`을 주거나 `<div>`로 만든다. flex·grid의 **직계** 자식만 승격되고",
  "  그 안의 손자는 아니다 — 막대 채우기가 여기서 가장 많이 죽는다.",
  "- **폰에서 무너지지 않게.** 가로 스크롤이 생기면 실패다.",
  "  한국어는 `word-break:keep-all`을 깔아야 단어 중간에서 안 끊긴다.",
].join("\n");

/** 스타일과 분리해 버전 관리하는 공통 품질 헌법. */
export const DESIGN_PRINCIPLES_VERSION = 1;
export const DESIGN_PRINCIPLES = [
  "첫 화면에서 역할, 강점, 대표 증거를 이해시킨다.",
  "장식보다 정보 위계를 우선한다.",
  "프로젝트의 문제, 본인 기여, 결과를 구분한다.",
  "동일한 카드 패턴을 모든 콘텐츠에 반복하지 않는다.",
  "한 섹션에는 하나의 주인공과 핵심 takeaway를 둔다.",
  "애니메이션은 등장, 관계, 상태 변화를 설명할 때만 사용한다.",
  "인터랙션은 탐색이나 이해를 개선해야 한다.",
  "모바일에서도 핵심 증거와 연락 행동을 보존한다.",
  "키보드 접근, 포커스 표시, 명도 대비, 모션 감소를 지원한다.",
  "설계안에 없는 사실, 프로젝트, 회사명, 성과, 수치를 만들지 않는다.",
] as const;

function buildPrompt(context: PageGenerationContext): string {
  const lines: string[] = [];

  if (context.company || context.jobTitle) {
    const company = context.company;
    lines.push("## 어디에 내는가");
    lines.push([
      company?.name,
      company?.industry ? `(${company.industry})` : "",
      context.jobTitle ? `· ${context.jobTitle}` : "",
    ].filter(Boolean).join(" "));
    if (company?.toneSummary) lines.push(`회사 톤: ${company.toneSummary}`);
    if (company?.brandColors.length) lines.push(`브랜드 색: ${company.brandColors.join(", ")}`);
    lines.push("");
  }

  lines.push(`## 공통 디자인 원칙 v${DESIGN_PRINCIPLES_VERSION} — 스타일보다 우선한다`);
  lines.push(...DESIGN_PRINCIPLES.map((principle) => `- ${principle}`));
  lines.push("");

  if (context.style) {
    lines.push(pageStyleGrammarPrompt(context.style));
    lines.push("");
  }

  if (context.portfolioPlan) {
    lines.push("## 확정된 PortfolioPlan v1 — 내용과 순서를 임의로 바꾸지 않는다");
    lines.push(JSON.stringify(context.portfolioPlan, null, 2));
    lines.push("");
  } else {
    lines.push("## PortfolioPlan");
    lines.push("옛 레시피라 v1 설계안이 없다. 아래 섹션 설계를 보존하되 새 사실을 추가하지 않는다.");
    lines.push("");
  }

  lines.push(`## 근거 ${context.evidence.length}개 — 여기 있는 사실만 쓴다`);
  for (const [index, entry] of context.evidence.entries()) {
    lines.push(`### 근거 ${index + 1} — ${entry.label}`);
    lines.push(entry.text);
    lines.push("");
  }

  lines.push(`## 섹션 설계 ${context.sections.length}개 — 이 순서와 의도대로 만든다`);
  for (const [index, section] of context.sections.entries()) {
    lines.push(`### ${index + 1}. ${section.title}`);
    lines.push(`- 목적: ${section.purpose}`);
    if (section.goal) lines.push(`- 남길 것: ${section.goal}`);
    if (section.points.length) lines.push(`- 다룰 것: ${section.points.join(" · ")}`);
    lines.push(`- 분량: 약 ${section.targetLength}자`);
  }
  lines.push("");

  if (context.media.length > 0) {
    lines.push("## 쓸 수 있는 그림 — 주소를 그대로 옮긴다");
    for (const asset of context.media) {
      lines.push(
        `- \`${asset.src}\` (${asset.width}×${asset.height}) — ${asset.alt}`
        + `\n  srcset: \`${asset.srcSet}\``,
      );
    }
    lines.push("**그림이 있는 섹션은 그림이 주인공이다.** 글 옆에 작게 끼우지 마라.");
    lines.push("");
  } else {
    lines.push("## 그림");
    lines.push("쓸 수 있는 사진이 없다. 필요하면 CSS와 SVG로 직접 그린다.");
    lines.push("");
  }

  if (context.previous && context.instruction) {
    lines.push("## 지금 지면 — 지시가 건드리지 않은 것은 그대로 둔다");
    lines.push("```html");
    lines.push(context.previous.html);
    lines.push("```");
    lines.push("```css");
    lines.push(context.previous.css);
    lines.push("```");
    lines.push("");
    lines.push(`## 지시\n${context.instruction}`);
    lines.push("지시대로 고친 지면 전체를 내라.");
  } else {
    if (context.instruction) lines.push(`## 요청\n${context.instruction}\n`);
    lines.push("이 사람의 포트폴리오 페이지를 만들어라.");
  }

  return lines.join("\n");
}

/** 태그를 걷어낸 글자. 근거 대조는 **화면에 보이는 것**을 봐야 한다. */
export function visibleText(html: string): string {
  return html
    .replaceAll(/<[^>]*>/g, " ")
    .replaceAll(/&nbsp;/g, " ")
    .replaceAll(/&amp;/g, "&")
    .replaceAll(/\s+/g, " ")
    .trim();
}

export class AiPageGenerator implements PageGenerator {
  readonly #ai: AiClient;

  constructor(ai: AiClient) {
    this.#ai = ai;
  }

  async generate(context: PageGenerationContext): Promise<GeneratedPageResult> {
    if (context.sections.length === 0) throw new PageGenerationError("만들 섹션이 없습니다");

    const prompt = buildPrompt(context);
    const useKit = Boolean(context.useKit && context.style);
    const source = context.evidence.map(({ text }) => text).join("\n");
    let lastError: unknown;
    let lenient: GeneratedPageResult | null = null;
    const total: AiUsage = {
      model: "unknown",
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      costUsd: 0,
      durationMs: 0,
    };

    for (const attempt of [1, 2]) {
      try {
        const { data, usage } = await this.#ai.complete(
          {
            contract: "page_generation",
            system: useKit ? SYSTEM_KIT : SYSTEM,
            prompt: attempt === 1 ? prompt : `${prompt}\n\n${retryNote(lastError)}`,
            promptVersion: PAGE_PROMPT_VERSION,
            ...(context.modelTier ? { modelTier: context.modelTier } : {}),
          },
          PageDraftSchema,
        );
        total.model = usage.model;
        total.inputTokens += usage.inputTokens;
        total.outputTokens += usage.outputTokens;
        total.cacheReadTokens += usage.cacheReadTokens;
        total.cacheCreationTokens += usage.cacheCreationTokens;
        total.durationMs += usage.durationMs;
        total.costUsd = total.costUsd === null || usage.costUsd === null
          ? null
          : total.costUsd + usage.costUsd;

        const clean = sanitizePage(data);
        // 규칙 없는 클래스는 **화면에서 요소가 사라진다는 뜻**이다. 모델은 제
        // 지면을 못 보므로 이걸 스스로 알 길이 없다. 이름을 짚어 되돌려 준다.
        //
        // 검사는 **실제로 실릴 CSS 전부**를 봐야 한다. 키트를 빼고 보면 `k-*`가
        // 전부 규칙 없음으로 걸리고, 모델은 그걸 고치려고 키트를 통째로 다시
        // 쓴다 — 키트를 만든 이유가 그대로 사라진다(실측에서 토큰이 되레 늘었다).
        const styleSheet = useKit ? `${PAGE_KIT_CSS}\n${clean.css}` : clean.css;
        const unstyled = unstyledClasses(clean.html, styleSheet);
        const inlineSized = inlineSizedClasses(clean.html, styleSheet);
        const ungrounded = ungroundedNumbers(visibleText(clean.html), source)
          // 한 자리 수는 장식이다 — 섹션 번호 · 목록 순번이 여기 걸린다.
          .filter((number) => number.replace(/\D/g, "").length >= 2);
        const qaReport = pageQa({
          ungrounded,
          removed: clean.removed,
          unstyled,
          inlineSized,
          styleSheet,
          portfolioPlan: context.portfolioPlan,
        });
        const promptHash = createHash("sha256")
          .update(`${useKit ? SYSTEM_KIT : SYSTEM}\0${prompt}`)
          .digest("hex");
        const manifest: PageGenerationManifest = {
          methodologyVersion: 1,
          model: total.model,
          promptHash,
          promptVersions: {
            page: PAGE_PROMPT_VERSION,
            designPrinciples: DESIGN_PRINCIPLES_VERSION,
          },
          tools: [],
          sourceUrls: [...new Set(
            context.portfolioPlan?.companyContext.flatMap(({ sourceUrl }) =>
              sourceUrl ? [sourceUrl] : []) ?? [],
          )],
          attempts: attempt,
          repairCount: attempt - 1,
          usage: {
            inputTokens: total.inputTokens,
            outputTokens: total.outputTokens,
            cacheReadTokens: total.cacheReadTokens,
            cacheCreationTokens: total.cacheCreationTokens,
            durationMs: total.durationMs,
            costUsd: total.costUsd,
          },
        };
        const result: GeneratedPageResult = {
          html: clean.html,
          css: clean.css,
          rationale: data.rationale,
          ungrounded,
          removed: clean.removed,
          usage: { ...total },
          qaReport,
          manifest,
        };

        if (qaReport.status === "ready") {
          return result;
        }
        // 한 번은 구체적인 실패 목록으로 고치게 한다. 두 번째에도 남으면 결과를
        // 버리지 않고 failed_qa 초안으로 보존하되 공개 문서 경로에서는 제외한다.
        lenient = result;
        throw new PageGenerationError(
          qaReport.checks
            .filter(({ status, severity }) => status === "fail" && severity === "error")
            .map(({ detail }) => detail)
            .join("\n"),
        );
      } catch (error) {
        if (error instanceof AiError && error.code !== "AI_INVALID_OUTPUT") throw error;
        lastError = error;
      }
    }

    if (lenient) return lenient;
    throw new PageGenerationError(
      `지면 생성이 두 번 모두 거절되었습니다: ${String(lastError)}`,
      { cause: lastError },
    );
  }
}

function pageQa(input: {
  ungrounded: string[];
  removed: string[];
  unstyled: string[];
  inlineSized: string[];
  styleSheet: string;
  portfolioPlan: PortfolioPlan | null;
}): PageQaReport {
  const checks: PageQaReport["checks"] = [];
  const check = (
    name: PageQaReport["checks"][number]["name"],
    pass: boolean,
    severity: PageQaReport["checks"][number]["severity"],
    detail: string,
  ) => checks.push({ name, status: pass ? "pass" : "fail", severity, detail });

  check(
    "grounded-numbers",
    input.ungrounded.length === 0,
    "error",
    input.ungrounded.length === 0 ? "모든 수치가 근거에 있음" : `근거 없는 수치: ${input.ungrounded.join(", ")}`,
  );
  check(
    "sanitized-output",
    input.removed.length === 0,
    "error",
    input.removed.length === 0 ? "소독기가 제거한 출력 없음" : `제거됨: ${input.removed.join(", ")}`,
  );
  check(
    "styled-elements",
    input.unstyled.length === 0,
    "error",
    input.unstyled.length === 0 ? "모든 클래스에 스타일이 있음" : `스타일 없음: ${input.unstyled.join(", ")}`,
  );
  check(
    "sized-elements",
    input.inlineSized.length === 0,
    "error",
    input.inlineSized.length === 0 ? "크기 지정 요소의 display가 유효함" : `inline 크기 오류: ${input.inlineSized.join(", ")}`,
  );
  check(
    "responsive-css",
    /@media\s*\(/i.test(input.styleSheet),
    "error",
    /@media\s*\(/i.test(input.styleSheet) ? "반응형 media query 있음" : "반응형 media query 없음",
  );
  const animated = /\b(?:animation|transition)\s*:/i.test(input.styleSheet);
  check(
    "reduced-motion",
    !animated || /prefers-reduced-motion\s*:\s*reduce/i.test(input.styleSheet),
    "error",
    !animated || /prefers-reduced-motion\s*:\s*reduce/i.test(input.styleSheet)
      ? "모션 감소 경로 있음"
      : "애니메이션은 있으나 모션 감소 경로가 없음",
  );
  check(
    "portfolio-plan",
    input.portfolioPlan !== null,
    "warning",
    input.portfolioPlan ? "PortfolioPlan v1 사용" : "옛 레시피 호환 경로",
  );

  return {
    status: checks.some(({ status, severity }) => status === "fail" && severity === "error")
      ? "failed_qa"
      : "ready",
    checks,
  };
}

function retryNote(error: unknown): string {
  const detail = error instanceof PageSanitizeError
    ? error.reason
    : error instanceof Error ? error.message : String(error);
  return [
    `직전 시도는 거절되었다. 사유: ${detail}`,
    "같은 실수를 반복하지 말고 다시 만들어라.",
  ].join("\n");
}
