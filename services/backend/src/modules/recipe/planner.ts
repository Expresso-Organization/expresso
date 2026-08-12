import {
  RecipeDraftSchema,
  isCompleteSentence,
  type CompanyResearchItem,
  type RecipeDraft,
} from "@expresso/contracts";

import { AiError, type AiClient, type AiUsage } from "../../platform/ai/client.js";

/**
 * §8.3 「레시피 생성」 계약 — 무엇을 담을지 정한다.
 *
 * 지금까지 이 자리는 섹션 제목 세 개(`핵심 소개` · `주요 경험` · `성과와 배운 점`)를
 * 고정해 두고 재료를 **번갈아 나눠 담았다**. 그래서 어느 공고에 지원하든 같은
 * 뼈대가 나왔고, 항목 문구는 기록 제목 그대로였다.
 *
 * 레시피는 **계획**이다(§8.3: 완성 문장 생성 금지). 문장은 추출이 쓴다. 여기서
 * 정하는 것은 섹션 구성 · 각 섹션의 목적과 톤 · 어떤 재료를 어디에 놓을지,
 * 그리고 **무엇을 안 쓰는지와 그 이유**다.
 *
 * 재료를 **번호**로 준다. 지면 · 추출과 같은 이유 — UUID를 옮겨 적게 하지 않는다.
 */

/** 프롬프트를 고치면 올린다. */
export const RECIPE_PROMPT_VERSION = 2;

export class RecipePlanError extends Error {
  constructor(message: string, options: { cause?: unknown } = {}) {
    super(message, options.cause === undefined ? {} : { cause: options.cause });
    this.name = "RecipePlanError";
  }
}

export type PlannerSourceType = "record" | "requirement" | "answer";

export interface PlannerSource {
  /** 번호는 배열 순서 + 1이다. */
  type: PlannerSourceType;
  id: string;
  label: string;
  /** 재료 원문. 기록 본문 · 요건 인용 · 답변 전문. */
  text: string;
}

export interface PlannerContext {
  sources: PlannerSource[];
  company: { name: string; industry: string | null; toneSummary: string | null } | null;
  jobTitle: string | null;
  /** 공고가 요구하는 것. 섹션 구성이 이걸 향해야 한다. */
  requirements: { label: string; kind: string }[];
  /** 사실과 해석이 분리된 회사 조사. 사용자 성과의 근거로는 쓸 수 없다. */
  companyResearch: CompanyResearchItem[];
  /** 분량 프리셋이 정한 전체 글자 수. 섹션 합이 여기 맞아야 한다. */
  totalLength: number;
}

export interface RecipePlanner {
  plan(context: PlannerContext): Promise<RecipePlanResult>;
}

export interface RecipePlanResult {
  draft: RecipeDraft;
  usage: AiUsage | null;
  attempts: number;
}

const SYSTEM = [
  "너는 채용 지원용 포트폴리오의 **구성**을 짠다. 글을 쓰는 것이 아니라",
  "무엇을 어디에 담을지 정하는 일이다.",
  "산출물은 Expresso의 PortfolioPlan v1이다.",
  "",
  "## 절대 규칙 — 문장을 쓰지 않는다",
  "항목(pointText)은 **요점**이다. \"일 1,200만 건 처리 · 큐 분리\"처럼 적는다.",
  "\"...했습니다\" · \"...입니다\"로 끝나는 완성 문장을 쓰면 그 초안은 거절된다.",
  "문장은 다음 단계가 쓴다. 여기서 미리 쓰면 고칠 곳이 두 군데로 갈린다.",
  "",
  "## 섹션 구성",
  "- 3~7개. **공고가 묻는 것에 맞춰** 정한다. 정해진 제목 세트가 있는 것이 아니다.",
  "  공고가 장애 대응을 물으면 그 섹션을 두고, 안 물으면 두지 않는다.",
  "- 제목은 그 사람의 것으로 쓴다. \"주요 경험\" 같은 어느 이력서에나 붙는 라벨 말고,",
  "  무엇을 말하는 섹션인지 알 수 있게 쓴다.",
  "- 첫 섹션은 **이 사람이 무엇을 하는 사람인지**가 한눈에 들어와야 한다.",
  "- 재료가 없는 섹션은 만들지 않는다. 채울 것이 없으면 섹션을 줄인다.",
  "",
  "## 재료 배치",
  "- 항목마다 쓸 재료 번호를 단다. 근거 없는 항목은 만들 수 없다.",
  "- **같은 기록을 여러 섹션에 넣지 않는다.** 넣으면 같은 이야기가 두 번 나온다.",
  "- 재료의 무게를 본다. 수치와 기간이 있는 기록이 더 앞에, 더 큰 자리를 받는다.",
  "- metrics에는 **재료에 실제로 적힌 수치만** 옮긴다. 없으면 빈 배열로 둔다.",
  "",
  "## 안 쓴 재료",
  "쓰지 않은 **기록**은 unused에 번호와 이유를 적는다.",
  "\"우선순위가 낮음\" 같은 말이 아니라 **이 공고 기준으로 왜 뺐는지** 쓴다 —",
  "\"공고가 프런트엔드를 묻지 않아 뺐다\"처럼.",
  "",
  "## 섹션마다 정할 것",
  "- purpose: 이 섹션이 읽는 사람에게 무엇을 남기는가.",
  "- goal: 이 섹션을 **왜 두는가**. 공고의 어느 요구에 답하는지 밝힌다.",
  "- points: 이 섹션에서 다룰 논점.",
  "- metrics: 살릴 수치.",
  "- tone: 이 섹션의 말투. 회사 톤이 주어지면 거기서 출발한다.",
  "- format: narrative(서사) · bullets(나열) · metrics(수치 중심) · timeline(시간순).",
  "- exclude: 이 섹션에서 쓰면 안 되는 말. 과장 · 상투구 · 근거 없는 주장 중",
  "  **이 섹션에서 특히 위험한 것**을 적는다.",
  "- targetLength: 이 섹션의 글자 수. 모든 섹션의 합이 주어진 전체 분량이어야 한다.",
  "- takeaway: 읽은 사람이 이 섹션에서 기억할 한 가지.",
  "- contentPattern: hero · case-study · metrics · timeline · capabilities · about · contact 중 하나.",
  "- interactionOpportunity: 내용을 더 잘 이해시키는 상호작용. 필요 없으면 null.",
  "",
  "## 설계안 핵심",
  "- positioning은 이 사람의 실제 기록에서만 만든다.",
  "- requirementCoverage의 requirementSource는 공고 요건 번호만 가리킨다.",
  "- evidenceSources와 claims는 기록 또는 인터뷰 답변만 가리킨다. 공고와 회사 정보는",
  "  사용자 성과의 증거가 아니다.",
  "- missing 요건은 빈 evidenceSources로 둔다. 채우려고 경험을 만들지 않는다.",
  "- allowedNumbers는 연결한 근거에 적힌 형태 그대로만 쓴다.",
  "- 회사 조사 fact는 확인된 맥락, signal은 해석이다. 둘을 사용자 경험처럼 말하지 않는다.",
].join("\n");

const SOURCE_KIND: Record<PlannerSourceType, string> = {
  record: "기록",
  requirement: "공고 요건",
  answer: "인터뷰 답변",
};

function buildPrompt(context: PlannerContext): string {
  const lines: string[] = [];
  if (context.jobTitle) lines.push(`지원 공고: ${context.jobTitle}`);
  if (context.company) {
    const { name, industry, toneSummary } = context.company;
    lines.push(`회사: ${name}${industry ? ` (${industry})` : ""}`);
    if (toneSummary) lines.push(`회사 톤: ${toneSummary}`);
  }
  if (context.requirements.length > 0) {
    lines.push("", "## 공고가 요구하는 것");
    lines.push(...context.requirements.map(({ label, kind }) => `- [${kind}] ${label}`));
  }

  if (context.companyResearch.length > 0) {
    lines.push("", "## 회사 조사 — 맥락과 우선순위에만 쓴다");
    for (const item of context.companyResearch) {
      lines.push(`- [${item.kind}/${item.confidence}] ${item.topic}: ${item.statement}`);
      if (item.sourceUrl) lines.push(`  출처: ${item.sourceUrl}`);
    }
  }

  lines.push("", `## 재료 ${context.sources.length}건`);
  for (const [index, source] of context.sources.entries()) {
    lines.push(`${index + 1}. [${SOURCE_KIND[source.type]}] ${source.label}`);
    const body = source.text.trim();
    if (body && body !== source.label.trim()) lines.push(`   ${body.replaceAll("\n", "\n   ")}`);
  }

  lines.push(
    "",
    `전체 분량은 ${context.totalLength}자다. 섹션들의 targetLength 합을 여기 맞춘다.`,
    "이 공고에 맞는 구성을 짜라.",
  );
  return lines.join("\n");
}

/** 초안이 우리가 준 재료만 가리키는지, 분량이 맞는지. */
function complaints(draft: RecipeDraft, context: PlannerContext): string[] {
  const found: string[] = [];
  const count = context.sources.length;

  const cited = draft.sections.flatMap(({ items }) => items.flatMap(({ sources }) => sources));
  const outOfRange = [...new Set(cited)].filter((number) => number > count);
  if (outOfRange.length > 0) found.push(`${outOfRange.join(" · ")}번 재료는 없습니다`);

  // 같은 기록이 두 섹션에 들어가면 같은 이야기가 두 번 나온다.
  const sectionsBySource = new Map<number, Set<number>>();
  for (const [index, section] of draft.sections.entries()) {
    for (const item of section.items) {
      for (const number of item.sources) {
        const bucket = sectionsBySource.get(number) ?? new Set<number>();
        bucket.add(index);
        sectionsBySource.set(number, bucket);
      }
    }
  }
  const reused = [...sectionsBySource]
    .filter(([number, sections]) =>
      sections.size > 1 && context.sources[number - 1]?.type === "record")
    .map(([number]) => number);
  if (reused.length > 0) found.push(`${reused.join(" · ")}번 기록이 여러 섹션에 들어갔습니다`);

  const total = draft.sections.reduce((sum, { targetLength }) => sum + targetLength, 0);
  const slack = Math.round(context.totalLength * 0.2);
  if (Math.abs(total - context.totalLength) > slack) {
    found.push(`분량 합이 ${total}자입니다 (${context.totalLength}자 ± ${slack})`);
  }

  // §8.3: 완성 문장 생성 금지. 여기서 문장을 쓰면 추출이 할 일이 없어진다.
  const sentences = draft.sections
    .flatMap(({ items }) => items.map(({ pointText }) => pointText))
    .filter((text) => isCompleteSentence(text));
  if (sentences.length > 0) {
    found.push(`요점이 아니라 완성 문장입니다: "${sentences[0]}"`);
  }

  const badUnused = draft.unused.filter(({ source }) =>
    context.sources[source - 1]?.type !== "record");
  if (badUnused.length > 0) found.push("unused에는 기록만 적습니다");

  const sourceAt = (number: number) => context.sources[number - 1];
  const badCoverage = draft.plan.requirementCoverage.filter(({ requirementSource }) =>
    sourceAt(requirementSource)?.type !== "requirement");
  if (badCoverage.length > 0) found.push("requirementCoverage는 공고 요건만 가리켜야 합니다");

  const badEvidence = [
    ...draft.plan.requirementCoverage.flatMap(({ evidenceSources }) => evidenceSources),
    ...draft.plan.claims.flatMap(({ evidenceSources }) => evidenceSources),
  ].filter((number) => !["record", "answer"].includes(sourceAt(number)?.type ?? ""));
  if (badEvidence.length > 0) {
    found.push(`사용자 주장의 근거는 기록 또는 답변이어야 합니다: ${[...new Set(badEvidence)].join(" · ")}`);
  }

  const missingWithEvidence = draft.plan.requirementCoverage.filter((entry) =>
    entry.coverage === "missing" && entry.evidenceSources.length > 0);
  if (missingWithEvidence.length > 0) found.push("missing 요건에는 사용자 근거를 붙일 수 없습니다");

  for (const claim of draft.plan.claims) {
    const evidenceText = claim.evidenceSources
      .map((number) => sourceAt(number)?.text ?? "")
      .join("\n");
    const invented = claim.allowedNumbers.filter((number) => !evidenceText.includes(number));
    if (invented.length > 0) found.push(`근거에 없는 허용 수치입니다: ${invented.join(" · ")}`);
  }

  return found;
}

export class AiRecipePlanner implements RecipePlanner {
  readonly #ai: AiClient;

  constructor(ai: AiClient) {
    this.#ai = ai;
  }

  async plan(context: PlannerContext): Promise<RecipePlanResult> {
    if (context.sources.length < 3) throw new RecipePlanError("재료가 세 건보다 적습니다");

    const prompt = buildPrompt(context);
    let lastError: unknown;
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
            contract: "recipe_draft",
            system: SYSTEM,
            prompt: attempt === 1 ? prompt : `${prompt}\n\n${retryNote(lastError)}`,
            promptVersion: RECIPE_PROMPT_VERSION,
          },
          RecipeDraftSchema,
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
        const found = complaints(data, context);
        if (found.length > 0) throw new RecipePlanError(found.join(", "));
        return { draft: data, usage: total, attempts: attempt };
      } catch (error) {
        if (error instanceof AiError && error.code !== "AI_INVALID_OUTPUT") throw error;
        lastError = error;
      }
    }
    throw new RecipePlanError(
      `레시피 초안이 두 번 모두 계약을 벗어났습니다: ${String(lastError)}`,
      { cause: lastError },
    );
  }
}

function retryNote(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  return `직전 시도는 거절되었다. 사유: ${detail}\n같은 실수를 반복하지 말고 다시 짜라.`;
}

/**
 * AI가 꺼져 있을 때 쓰는 폴백.
 *
 * 예전 규칙 그대로다 — 섹션 셋을 고정하고 재료를 번갈아 담는다. 공고에 맞춘
 * 구성은 아니지만 근거는 정확하고, 키도 로그인도 없이 앱 전체가 돈다.
 */
export class DeterministicRecipePlanner implements RecipePlanner {
  async plan(context: PlannerContext): Promise<RecipePlanResult> {
    const titles = ["핵심 소개", "주요 경험", "성과와 배운 점"];
    const perSection = Math.max(100, Math.round(context.totalLength / titles.length));
    // 종류별로 둘씩 고른다. 세 갈래가 다 들어가야 레시피가 한쪽으로 기울지 않는다.
    const pick = (type: PlannerSourceType) => context.sources
      .flatMap((source, index) => source.type === type ? [{ source, number: index + 1 }] : [])
      .slice(0, 2);
    const used = [...pick("record"), ...pick("requirement"), ...pick("answer")];
    const cited = new Set(used.map(({ number }) => number));

    const draft = RecipeDraftSchema.parse({
      plan: {
        positioning: {
          headlineIntent: context.jobTitle
            ? `${context.jobTitle}에 연결되는 검증된 경험을 먼저 제시`
            : "검증된 경험을 먼저 제시",
          valueProposition: "선택한 기록의 행동과 결과로 기여 가능성을 설명",
          differentiators: ["근거가 연결된 실제 프로젝트"],
        },
        requirementCoverage: context.sources.flatMap((source, index) => {
          if (source.type !== "requirement") return [];
          const evidence = used.filter(({ source: usedSource }) =>
            usedSource.type === "record" || usedSource.type === "answer");
          return [{
            requirementSource: index + 1,
            priority: source === context.sources.find((entry) => entry.type === "requirement") ? 1 : 0.7,
            evidenceSources: evidence.slice(0, 2).map(({ number }) => number),
            coverage: evidence.length > 0 ? "partial" as const : "missing" as const,
            reason: evidence.length > 0
              ? "선택된 사용자 근거와 함께 검토 필요"
              : "연결할 사용자 근거가 없음",
          }];
        }),
        narrativeArc: "지원 직무와 연결되는 경험에서 구체적인 실행과 결과로 진행",
        claims: used.flatMap(({ source, number }) =>
          source.type === "record" || source.type === "answer"
            ? [{
              intent: source.label.slice(0, 500),
              evidenceSources: [number],
              allowedNumbers: [],
            }]
            : []),
        exclusions: ["근거 없는 수치", "출처 없는 주장", "회사 조사로 만든 사용자 경험"],
        rationale: "공고 요건과 선택된 사용자 근거를 우선 배치한 규칙 기반 설계안",
      },
      sections: titles.map((title, index) => ({
        title,
        purpose: `${title}에 맞는 근거를 배치`,
        targetLength: perSection,
        goal: "선택한 근거로 핵심 경험을 설명",
        points: [title],
        metrics: [],
        tone: "professional",
        format: "narrative",
        exclude: ["근거 없는 수치", "출처 없는 주장"],
        takeaway: `${title}에서 검증된 근거 한 가지를 남긴다`,
        contentPattern: index === 0 ? "hero" : index === 1 ? "case-study" : "metrics",
        interactionOpportunity: null,
        items: used
          .map((entry, slot) => ({ ...entry, slot }))
          .filter(({ slot }) => slot % titles.length === index)
          .map(({ source, number }) => ({
            // 재료 라벨을 그대로 옮긴다. 문장이 아니라 라벨이라 계약을 통과한다.
            pointText: source.label.slice(0, 200),
            sources: [number],
          })),
      })).filter(({ items }) => items.length > 0),
      unused: context.sources.flatMap((source, index) =>
        source.type === "record" && !cited.has(index + 1)
          ? [{
            source: index + 1,
            reason: "현재 분량에서 우선순위가 높은 근거를 먼저 배치함",
          }]
          : []),
    });
    return { draft, usage: null, attempts: 1 };
  }
}
