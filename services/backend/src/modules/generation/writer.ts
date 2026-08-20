import {
  draftBlockText,
  GenerationDraftSchema,
  GenerationOutputSchema,
  type GenerationDraft,
  type GenerationOutput,
} from "@expresso/contracts";

import { AiError, type AiClient } from "../../platform/ai/client.js";

/**
 * §8.3 「추출(brew)」 계약 — 레시피를 실제 문장으로 바꾼다.
 *
 * 지금까지 이 자리는 레시피 항목을 **그대로 복사**했다. 검증기가 "문장이 근거
 * 라벨과 글자까지 같을 것"을 요구했기 때문이고, 그래서 포트폴리오에 실리는 글이
 * 기록 제목이었다. 검증을 수치 기준으로 바꾸면서(§8.3 환각 방지 ①) 이 자리가
 * 열렸다.
 *
 * 모델에게 **섹션 · 근거를 번호로** 준다. 지면 생성과 같은 이유다 — UUID를
 * 옮겨 적게 하면 한 글자 틀린 블록이 통째로 사라진다.
 */

/** 프롬프트를 고치면 올린다. */
export const GENERATION_PROMPT_VERSION = 3;

export class SentenceDraftError extends Error {
  constructor(message: string, options: { cause?: unknown } = {}) {
    super(message, options.cause === undefined ? {} : { cause: options.cause });
    this.name = "SentenceDraftError";
  }
}

export interface WriterSection {
  /** 프롬프트 번호(1부터)와 짝이 되는 실제 섹션. */
  recipeSectionId: string;
  title: string;
  purpose: string;
  targetLength: number;
  goal: string;
  points: string[];
  metrics: string[];
  tone: string;
  format: string;
  exclude: string[];
  /** 이 섹션에 배치된 아웃라인 항목. 근거 번호를 달고 있다. */
  items: { pointText: string; sourceNumbers: number[] }[];
}

export interface WriterEvidence {
  /** `recipe_evidence_path.id`. 번호는 배열 순서 + 1이다. */
  id: string;
  sourceType: "record" | "requirement" | "answer";
  label: string;
  text: string;
}

export interface WriterContext {
  sections: WriterSection[];
  evidence: WriterEvidence[];
  company: {
    name: string;
    industry: string | null;
    toneSummary: string | null;
  } | null;
  jobTitle: string | null;
  /** 사용자가 잠근 문장. 그대로 살아남아야 한다(P3). */
  lockedTexts: string[];
}

export interface SentenceWriter {
  /**
   * 계약을 부르는가.
   *
   * 밖으로 나가는 것이 있을 때만 동의를 묻는다. 클래스 이름으로 판단하지
   * 않는다 — 이름은 번들러가 바꾼다.
   */
  readonly usesContract: boolean;
  write(context: WriterContext): Promise<GenerationOutput>;
}

export class SentenceWriterUnavailableError extends Error {
  constructor() {
    super("sentence writer is unavailable: AI provider is off");
    this.name = "SentenceWriterUnavailableError";
  }
}

/**
 * AI가 꺼져 있을 때 그 자리에 서는 것.
 *
 * 예전에는 아웃라인 항목을 그대로 문단으로 옮기는 폴백이 있었다. 근거는
 * 정확했지만 결과물은 **문단 아홉 개짜리 개요**였고, 화면은 그것을
 * "포트폴리오"라고 불렀다. 요건 추출과 같은 병이다 — 품질이 조용히 갈리는
 * 두 경로를 두지 않는다.
 */
export class UnavailableSentenceWriter implements SentenceWriter {
  readonly usesContract = false;

  async write(): Promise<never> {
    throw new SentenceWriterUnavailableError();
  }
}

const SYSTEM = [
  "너는 채용 지원용 포트폴리오의 **문장**을 쓴다.",
  "지원자의 커리어 기록과 공고 요건이 근거로 주어진다. 거기 있는 것만 쓴다.",
  "",
  "## 무엇을 내는가",
  "섹션마다 블록 몇 개. 블록은 heading · paragraph · list · metric · chart 중 하나이고,",
  "자기가 쓴 근거 번호를 단다. 근거를 달지 않은 블록은 만들 수 없다.",
  "",
  "## 지어내지 않는다",
  "- **숫자는 근거에 있는 것만 쓴다.** 근거에 없는 수치가 하나라도 있으면 그 추출은",
  "  통째로 버려진다. \"약 30%\" · \"수백만 건\"처럼 없는 값을 지어내거나 어림하지 않는다.",
  "- **근거가 쓴 형태 그대로 옮긴다.** 근거가 \"3,000만 건\"이면 \"3천만 건\"으로 바꾸지 않고,",
  "  \"두 시간\"이라고 적혀 있으면 \"2시간\"으로 고치지 않는다.",
  "- 도구 · 회사 · 팀 이름도 근거에 있는 것만. 근거에 없는 성과 · 역할 · 기간을 덧붙이지 않는다.",
  "- 근거가 얇으면 짧게 쓴다. 분량을 채우려고 없는 말을 만들지 않는다.",
  "",
  "## 좋은 문장",
  "- **구체가 먼저다.** \"다양한 경험을 쌓았습니다\"는 아무 말도 하지 않는다.",
  "  무엇을 · 얼마나 · 어떻게 되었는지가 첫 문장에 있어야 한다.",
  "- **숫자와 고유명사를 살린다.** 근거에 있는 값을 뭉개지 말고 문장에 그대로 넣는다.",
  "- **그 회사의 말투로 쓴다.** 회사 톤이 주어지면 거기에 맞춘다.",
  "- 자소서 상투구를 쓰지 않는다 — \"열정을 가지고\" · \"많은 것을 배웠습니다\" ·",
  "  \"성장할 수 있었습니다\" · \"기여하고 싶습니다\" · \"노력하겠습니다\".",
  "- 과장하지 않는다. 담백한 사실이 과장보다 세다.",
  "- 한 문단은 한 가지만 말한다.",
  "",
  "## 블록 종류를 고르는 법",
  "- heading — 섹션의 첫 줄. 그 섹션이 무엇을 말하는지 **문장으로** 쓴다.",
  "  명사 나열(\"주요 성과\")은 제목이 아니라 라벨이다.",
  "- paragraph — 서사. 상황 → 한 일 → 결과 순서로 붙인다.",
  "- metric — 근거에 있는 **수치 하나**. text에는 값만(\"24분\" · \"3,000만 건\"),",
  "  label에는 그게 무엇인지. 지면이 이걸 크게 세운다. **아까운 수치를 문단에 묻지 말고 꺼낸다.**",
  "  단, 기록에서 나온 수치만 metric이 될 수 있다(공고 요건은 안 된다).",
  "- list — 도구 · 기술처럼 나열이 자연스러운 것. `items` 배열로 낸다.",
  "  문장을 목록으로 쪼개지 않는다.",
  "  **이름과 값이 있는 것은 쌍으로 낸다** — `{term:\"역할\", value:\"결제 서버 · 정산 배치\"}`.",
  "  기간 · 역할 · 규모 · 스택처럼 \"무엇: 무엇\" 꼴은 전부 쌍이다. 쌍으로 내야 지면이",
  "  이름을 조용히 두고 값을 세울 수 있다. 그냥 나열이면 문자열로 낸다.",
  "- chart — **견줄 수치가 둘 이상**일 때. 큰 숫자를 여러 개 세우는 것보다 그림 하나가",
  "  낫다. 그림은 근거의 수만으로 그려지므로 이미지가 필요 없다. 네 가지가 있다 —",
  "    bar   서로 다른 것을 견준다 (전/후, 항목별). 점 2~8개.",
  "    donut 하나를 나눠 담은 몫 (구성비). 점 2~5개.",
  "    gauge 얼마나 찼나 (달성률 · 가용성). 점 1개 + max.",
  "    spark 시간에 따른 흐름. 점 3개 이상, label에 시점을 적는다.",
  "  값은 **근거에 적힌 그대로**여야 한다. 단위는 unit에 따로 적는다(\"분\" · \"%\" · \"건\").",
  "  caption에는 이 그림이 무엇을 재는지 한 줄. text에도 같은 한 줄을 적는다.",
  "  견줄 것이 하나뿐이면 chart가 아니라 metric이다.",
  "",
  "",
  "## 문장 안에서 강조하기",
  "heading · paragraph는 `text` 대신 `runs`로 낼 수 있다 — 글을 토막으로 나누고",
  "그중 일부에만 표시를 붙인다. 표시는 다섯이다:",
  "  strong(굵게) · emphasis(기울임) · underline(밑줄) · highlight(형광) · code(고정폭)",
  "",
  "예 — [{text:\"정산 배치를 \"}, {text:\"3시간 40분에서 24분으로\", mark:\"strong\"},",
  "     {text:\" 줄였습니다.\"}]",
  "",
  "**한 문단에 한 곳이면 충분하다.** 두 곳을 넘기면 강조가 아니라 얼룩이 된다.",
  "강조할 자리는 **수치와 고유명사**다 — 형용사를 강조하지 않는다.",
  "`href`를 주면 링크가 된다. 근거에 적힌 주소만 쓴다(논문 · 저장소 · 배포된 서비스).",
  "",
  "섹션마다 목표 글자 수가 있다. 그 언저리로 맞추되, 근거가 모자라면 짧은 쪽을 고른다.",
].join("\n");

function describeSection(section: WriterSection, index: number): string {
  const lines = [`## 섹션 ${index + 1}. ${section.title} (목표 ${section.targetLength}자)`];
  if (section.purpose) lines.push(`목적: ${section.purpose}`);
  if (section.goal) lines.push(`이 섹션이 노리는 것: ${section.goal}`);
  if (section.points.length > 0) lines.push(`담을 것: ${section.points.join(" · ")}`);
  if (section.metrics.length > 0) lines.push(`살릴 수치: ${section.metrics.join(" · ")}`);
  if (section.tone) lines.push(`톤: ${section.tone}`);
  if (section.exclude.length > 0) {
    lines.push(`쓰면 안 되는 말: ${section.exclude.join(" · ")}`);
  }
  for (const item of section.items) {
    lines.push(`- ${item.pointText} [근거 ${item.sourceNumbers.join(" · ")}]`);
  }
  return lines.join("\n");
}

const SOURCE_KIND = {
  record: "기록",
  requirement: "공고 요건",
  answer: "인터뷰 답변",
} as const;

function buildPrompt(context: WriterContext): string {
  const lines: string[] = [];
  if (context.jobTitle) lines.push(`지원 공고: ${context.jobTitle}`);
  if (context.company) {
    const { name, industry, toneSummary } = context.company;
    lines.push(`회사: ${name}${industry ? ` (${industry})` : ""}`);
    if (toneSummary) lines.push(`회사 톤: ${toneSummary}`);
  }
  lines.push("", ...context.sections.map(describeSection));

  lines.push("", "## 근거");
  for (const [index, item] of context.evidence.entries()) {
    lines.push(`${index + 1}. [${SOURCE_KIND[item.sourceType]}] ${item.label}`);
    // 원문이 라벨과 같으면 두 번 싣지 않는다.
    const body = item.text.trim();
    if (body && body !== item.label.trim()) lines.push(`   ${body.replaceAll("\n", "\n   ")}`);
  }

  if (context.lockedTexts.length > 0) {
    lines.push("", "## 사용자가 잠근 문장 — 한 글자도 바꾸지 말고 그대로 다시 낸다");
    lines.push(...context.lockedTexts.map((text) => `- ${text}`));
  }

  lines.push("", "이 레시피대로 포트폴리오 문장을 써라.");
  return lines.join("\n");
}

/** 초안이 모든 섹션을 채웠는지. 빈 섹션이 있으면 지면에 구멍이 난다. */
function emptySections(draft: GenerationDraft, sectionCount: number): number[] {
  const filled = new Set(draft.blocks.map(({ section }) => section));
  const empty: number[] = [];
  for (let number = 1; number <= sectionCount; number += 1) {
    if (!filled.has(number)) empty.push(number);
  }
  return empty;
}

export class AiSentenceWriter implements SentenceWriter {
  readonly usesContract = true;
  readonly #ai: AiClient;

  constructor(ai: AiClient) {
    this.#ai = ai;
  }

  async write(context: WriterContext): Promise<GenerationOutput> {
    if (context.sections.length === 0) throw new SentenceDraftError("채울 섹션이 없습니다");
    if (context.evidence.length === 0) throw new SentenceDraftError("근거가 없습니다");

    const prompt = buildPrompt(context);
    let lastError: unknown;
    // 계약을 벗어나면 무엇이 틀렸는지 붙여 1회 다시 쓴다. 근거 검증(수치)은
    // 이 뒤에 `validateGenerationOutput`이 한 번 더 본다.
    for (const attempt of [1, 2]) {
      try {
        const { data } = await this.#ai.complete(
          {
            contract: "generation",
            system: SYSTEM,
            prompt: attempt === 1 ? prompt : `${prompt}\n\n${retryNote(lastError)}`,
            promptVersion: GENERATION_PROMPT_VERSION,
          },
          GenerationDraftSchema,
        );

        const empty = emptySections(data, context.sections.length);
        if (empty.length > 0) {
          throw new SentenceDraftError(`${empty.join(" · ")}번 섹션이 비었습니다`);
        }
        return toGenerationOutput(data, context);
      } catch (error) {
        if (error instanceof AiError && error.code !== "AI_INVALID_OUTPUT") throw error;
        lastError = error;
      }
    }
    throw new SentenceDraftError(
      `추출 초안이 두 번 모두 계약을 벗어났습니다: ${String(lastError)}`,
      { cause: lastError },
    );
  }
}

function retryNote(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  return `직전 시도는 거절되었다. 사유: ${detail}\n같은 실수를 반복하지 말고 다시 써라.`;
}

/**
 * 초안의 번호를 실제 식별자로 되돌린다.
 *
 * 없는 번호를 가리키는 근거는 버린다. 근거가 하나도 남지 않은 블록은 통째로
 * 버린다 — 근거 없는 문장은 이 제품이 낼 수 없는 물건이다.
 */
export function toGenerationOutput(
  draft: GenerationDraft,
  context: Pick<WriterContext, "sections" | "evidence">,
): GenerationOutput {
  const blocks = draft.blocks.flatMap((block) => {
    const section = context.sections[block.section - 1];
    if (!section) return [];
    const evidencePathIds = [...new Set(block.sources)]
      .map((number) => context.evidence[number - 1]?.id)
      .filter((id): id is string => Boolean(id));
    if (evidencePathIds.length === 0) return [];
    // 모델은 text · runs · items 중 하나로 낸다. 평문은 **우리가 이어 붙인다** —
    // 두 곳에 같은 글을 적게 하면 언젠가 어긋나고, 어긋난 쪽이 검증을 받는다.
    const written = draftBlockText(block);
    return [{
      recipeSectionId: section.recipeSectionId,
      kind: block.kind,
      text: block.kind === "list" ? tidyList(written) : written.trim(),
      runs: block.runs ?? null,
      items: block.items ?? null,
      label: block.kind === "metric" ? (block.label?.trim() ?? null) : null,
      chart: block.kind === "chart" ? (block.chart ?? null) : null,
      evidencePathIds,
    }];
  });

  const parsed = GenerationOutputSchema.safeParse({ blocks });
  if (!parsed.success) {
    throw new SentenceDraftError(`추출 결과가 계약을 벗어났습니다: ${parsed.error.message}`);
  }
  return parsed.data;
}

/** 목록의 글머리 기호를 걷어낸다. 지면이 `list-disc`로 다시 붙인다. */
function tidyList(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/^\s*[-·•*]\s*/, "").trim())
    .filter(Boolean)
    .join("\n");
}
