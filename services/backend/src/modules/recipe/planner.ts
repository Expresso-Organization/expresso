import {
  RecipeDraftSchema,
  type CompanyResearchItem,
  type RecipeDraft,
} from "@expresso/contracts";

import { type AiClient, type AiUsage } from "../../platform/ai/client.js";

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
  freeTitle?: string | null;
  freeBrief?: string | null;
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
  "## 편집 가능한 제안",
  "항목(pointText)은 요점이나 짧은 문장 어느 쪽이어도 된다. 사용자가 나중에 고친다.",
  "완결된 한 페이지 초안을 우선한다. 문체, 중복, 분량, 출처 연결은 전체 계획을 버리는 이유가 아니다.",
  "",
  "## 섹션 구성",
  "- 3~7개. **공고가 묻는 것에 맞춰** 정한다. 정해진 제목 세트가 있는 것이 아니다.",
  "  공고가 장애 대응을 물으면 그 섹션을 두고, 안 물으면 두지 않는다.",
  "- 제목은 그 사람의 것으로 쓴다. \"주요 경험\" 같은 어느 이력서에나 붙는 라벨 말고,",
  "  무엇을 말하는 섹션인지 알 수 있게 쓴다.",
  "- 첫 섹션은 **이 사람이 무엇을 하는 사람인지**가 한눈에 들어와야 한다.",
  "- 재료가 적은 섹션도 사용자가 보완할 수 있게 남길 수 있다. 빈 자리를 만들지는 않는다.",
  "",
  "## 재료 배치",
  "- 항목의 재료 번호는 연결할 수 있으면 단다. 없거나 불확실하면 빈 배열로 남긴다.",
  "- 같은 기록의 반복, 재료의 무게, 수치의 출처는 사용자가 검토할 수 있는 제안이다.",
  "- metrics는 도움이 될 때만 적고, 특정 수치를 임의로 만들어 내지 않는다.",
  "",
  "## 안 쓴 재료",
  "쓰지 않은 기록은 unused에 번호와 이유를 적을 수 있다. 빠진 기록은 자동으로 삭제하지 않는다.",
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
  "- targetLength: 이 섹션의 글자 수에 대한 제안. 합계는 검토 정보다.",
  "- takeaway: 읽은 사람이 이 섹션에서 기억할 한 가지.",
  "- contentPattern: hero · case-study · metrics · timeline · capabilities · about · contact 중 하나.",
  "- interactionOpportunity: 내용을 더 잘 이해시키는 상호작용. 필요 없으면 null.",
  "",
  "## 지어내지 않는다",
  "- 특정 숫자·회사명·프로젝트를 임의로 만들지 않는다. 회사 조사 fact와 signal은 맥락으로 구분한다.",
  "- 재료가 닿지 않는 요건은 비워 둔다. 채우려고 없는 경험을 만들지 않는다.",
].join("\n");

const SOURCE_KIND: Record<PlannerSourceType, string> = {
  record: "기록",
  requirement: "공고 요건",
  answer: "인터뷰 답변",
};

function buildPrompt(context: PlannerContext): string {
  const lines: string[] = [];
  if (context.jobTitle) lines.push(`지원 공고: ${context.jobTitle}`);
  if (context.freeTitle || context.freeBrief) {
    lines.push("", "## 사용자가 요청한 방향");
    if (context.freeTitle) lines.push(`포트폴리오 제목: ${context.freeTitle}`);
    if (context.freeBrief) lines.push(`요청 내용: ${context.freeBrief}`);
  }
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
    `권장 전체 분량은 ${context.totalLength}자다. 섹션들의 targetLength 합은 검토용 제안이다.`,
    "이 공고에 맞는 구성을 짜라.",
  );
  return lines.join("\n");
}

export class AiRecipePlanner implements RecipePlanner {
  readonly #ai: AiClient;

  constructor(ai: AiClient) {
    this.#ai = ai;
  }

  async plan(context: PlannerContext): Promise<RecipePlanResult> {
    const prompt = buildPrompt(context);
    // 편집 판단과 근거 평가는 사용자에게 남긴다. 이 단계는 스키마로 읽을 수 있는
    // 한 번의 설계안을 저장할 뿐, 문체·중복·수치 같은 편집 이유로 통째로 다시 묻지 않는다.
    const { data, usage } = await this.#ai.complete(
      {
        contract: "recipe_draft",
        system: SYSTEM,
        prompt,
        promptVersion: RECIPE_PROMPT_VERSION,
      },
      RecipeDraftSchema,
    );
    return { draft: data, usage, attempts: 1 };
  }
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
      sections: titles.map((title, index) => ({
        title,
        purpose: `${title}에 맞는 근거를 배치`,
        targetLength: perSection,
        goal: context.freeBrief && index === 0
          ? "사용자가 요청한 방향과 선택한 근거를 함께 설명"
          : "선택한 근거로 핵심 경험을 설명",
        points: [index === 0 && context.freeBrief ? context.freeBrief.slice(0, 500) : title],
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
      })),
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
