import {
  InterviewQuestionDraftListSchema,
  InterviewQuestionRewriteSchema,
  type InterviewQuestionBasis,
  type InterviewQuestionRewrite,
} from "@expresso/contracts";

import { AiError, type AiClient } from "../../platform/ai/client.js";

/**
 * §8.3 「질문 생성」 계약.
 *
 * 지금까지 이 자리는 문장 틀에 요건 이름을 끼워 넣었다 —
 * `${요건}와 관련해 직접 맡은 행동은 무엇인가요?`. 근거는 정확했지만 여섯 질문이
 * 전부 같은 모양이었고, **왜 이걸 묻는지**를 댈 수 없었다.
 *
 * 근거를 **번호로** 준다. 모델은 그중에서 무엇을 물을지 고르고 질문을 쓴다 —
 * 근거 자체는 우리가 만든다(요건 충족 상태 · 수치 없는 기록). 그래서 모델이
 * 고르더라도 질문은 항상 실제 공고와 실제 기록에 붙어 있다.
 */

/** 프롬프트를 고치면 올린다. */
export const QUESTION_PROMPT_VERSION = 1;

export class QuestionDraftError extends Error {
  constructor(message: string, options: { cause?: unknown } = {}) {
    super(message, options.cause === undefined ? {} : { cause: options.cause });
    this.name = "QuestionDraftError";
  }
}

/** 질문 하나가 붙을 수 있는 자리. 번호는 배열 순서 + 1이다. */
export interface QuestionBasisOption {
  basis: InterviewQuestionBasis;
  /** 프롬프트에 보여줄 한 줄. */
  label: string;
  /** 근거 원문 — 공고 인용이거나 기록 본문이다. */
  detail: string;
  /**
   * 공고가 이 말을 몇 번 꺼냈는지. 요건 근거에만 있다.
   * 세어서 주는 값이지 모델이 짐작하는 값이 아니다.
   */
  mentions: { term: string; count: number } | null;
}

export interface QuestionContext {
  options: QuestionBasisOption[];
  company: { name: string; industry: string | null; toneSummary: string | null } | null;
  jobTitle: string | null;
  /** 이미 고른 재료. 여기 있는 이야기를 또 묻지 않는다. */
  materials: string[];
}

export interface QuestionDraftResult {
  /** `options`의 자리. */
  optionIndex: number;
  text: string;
  rationale: string;
}

export interface QuestionWriter {
  draft(context: QuestionContext): Promise<QuestionDraftResult[]>;
  /** 같은 근거를 다른 각도에서 다시 묻는다(01b "다른 질문으로"). */
  rewrite(input: {
    option: QuestionBasisOption;
    previousTexts: string[];
    company: QuestionContext["company"];
    jobTitle: string | null;
  }): Promise<InterviewQuestionRewrite>;
}

const RULES = [
  "## 질문의 조건",
  "- **한 번에 한 가지만 묻는다.** 물음표는 하나다.",
  "- **예/아니오로 답할 수 있는 질문을 쓰지 않는다.**",
  "  \"Kafka를 써 보셨나요?\"가 아니라 \"Kafka로 무엇을 만드셨나요?\"다.",
  "  무엇 · 어떤 · 어떻게 · 왜 · 얼마나 중 하나가 들어가야 한다.",
  "- 답하는 사람이 **바로 이야기를 시작할 수 있어야** 한다. 정의를 묻지 않는다.",
  "- 짧게 쓴다. 두 줄이 넘으면 사람은 무엇을 묻는지 잊는다.",
  "- 이미 고른 재료에 답이 적혀 있는 것은 묻지 않는다.",
  "",
  "## rationale",
  "이 질문을 왜 하는지 한 문장. 01b가 질문 바로 아래에 보여준다.",
  "\"경험을 알기 위해\" 같은 아무 질문에나 붙는 말이 아니라,",
  "**이 공고의 무엇 때문에 묻는지**를 쓴다. 공고가 그 말을 여러 번 꺼냈다면",
  "그 횟수를 밝힌다 — \"공고가 Airflow를 세 번 언급했는데 기록에는 없습니다\"처럼.",
  "쓰는 사람은 이 문장을 읽고 답할지 말지 정한다.",
].join("\n");

const SYSTEM = [
  "너는 지원자에게서 포트폴리오에 쓸 이야기를 끌어내는 사람이다.",
  "공고가 요구하는데 기록에 없는 것, 기록에 있는데 결과가 빠진 것 —",
  "그 자리를 근거로 준다. 그중에서 **물어볼 값어치가 있는 것**을 골라 질문을 쓴다.",
  "",
  "근거 번호를 그대로 쓴다. 근거 없는 질문은 만들 수 없다.",
  "같은 근거로 두 번 묻지 않는다.",
  "",
  RULES,
].join("\n");

const REWRITE_SYSTEM = [
  "너는 지원자에게서 이야기를 끌어내는 사람이다.",
  "사용자가 방금 받은 질문을 **다른 질문으로 바꿔 달라고** 했다.",
  "같은 근거를 그대로 두고 **다른 각도에서** 하나만 다시 묻는다.",
  "앞서 나온 질문과 말만 바꾼 것은 바꾼 것이 아니다 — 묻는 지점이 달라야 한다.",
  "",
  RULES,
].join("\n");

function describeOption(option: QuestionBasisOption, index: number): string {
  const lines = [`${index + 1}. ${option.label}`];
  if (option.detail.trim()) lines.push(`   ${option.detail.trim().replaceAll("\n", "\n   ")}`);
  if (option.mentions && option.mentions.count > 1) {
    lines.push(`   공고가 "${option.mentions.term}"를 ${option.mentions.count}번 언급했다.`);
  }
  return lines.join("\n");
}

function header(
  company: QuestionContext["company"],
  jobTitle: string | null,
): string[] {
  const lines: string[] = [];
  if (jobTitle) lines.push(`지원 공고: ${jobTitle}`);
  if (company) {
    lines.push(`회사: ${company.name}${company.industry ? ` (${company.industry})` : ""}`);
    if (company.toneSummary) lines.push(`회사 톤: ${company.toneSummary}`);
  }
  return lines;
}

function buildPrompt(context: QuestionContext): string {
  const lines = header(context.company, context.jobTitle);
  if (context.materials.length > 0) {
    lines.push("", "## 이미 고른 재료 — 여기 답이 있는 것은 묻지 않는다");
    lines.push(...context.materials.map((material) => `- ${material}`));
  }
  lines.push("", `## 물을 수 있는 자리 ${context.options.length}개`);
  lines.push(...context.options.map(describeOption));
  lines.push(
    "",
    `여기서 ${Math.min(6, context.options.length)}개까지 골라 질문을 써라.`,
    "값어치가 없으면 적게 골라도 된다. 채우려고 억지 질문을 만들지 않는다.",
  );
  return lines.join("\n");
}

export class AiQuestionWriter implements QuestionWriter {
  readonly #ai: AiClient;

  constructor(ai: AiClient) {
    this.#ai = ai;
  }

  async draft(context: QuestionContext): Promise<QuestionDraftResult[]> {
    if (context.options.length === 0) throw new QuestionDraftError("물을 자리가 없습니다");

    const prompt = buildPrompt(context);
    let lastError: unknown;
    for (const attempt of [1, 2]) {
      try {
        const { data } = await this.#ai.complete(
          {
            contract: "question_draft",
            system: SYSTEM,
            prompt: attempt === 1 ? prompt : `${prompt}\n\n${retryNote(lastError)}`,
            promptVersion: QUESTION_PROMPT_VERSION,
          },
          InterviewQuestionDraftListSchema,
        );

        const seen = new Set<number>();
        const drafted: QuestionDraftResult[] = [];
        for (const question of data.questions) {
          // 없는 번호와 겹치는 번호는 그 질문만 버린다. 나머지는 살린다.
          if (question.basis > context.options.length || seen.has(question.basis)) continue;
          seen.add(question.basis);
          drafted.push({
            optionIndex: question.basis - 1,
            text: question.text,
            rationale: question.rationale,
          });
        }
        // 자리보다 많은 질문을 요구할 수는 없다 — 자리 하나에 질문 하나다.
        const wanted = Math.min(3, context.options.length);
        if (drafted.length < wanted) {
          throw new QuestionDraftError(
            `근거에 붙은 질문이 ${drafted.length}개뿐입니다 (모델은 ${data.questions.length}개를 냈습니다)`,
          );
        }
        return drafted;
      } catch (error) {
        if (error instanceof AiError && error.code !== "AI_INVALID_OUTPUT") throw error;
        lastError = error;
      }
    }
    throw new QuestionDraftError(
      `질문 초안이 두 번 모두 계약을 벗어났습니다: ${String(lastError)}`,
      { cause: lastError },
    );
  }

  async rewrite(input: {
    option: QuestionBasisOption;
    previousTexts: string[];
    company: QuestionContext["company"];
    jobTitle: string | null;
  }): Promise<InterviewQuestionRewrite> {
    const lines = header(input.company, input.jobTitle);
    lines.push("", "## 근거", describeOption(input.option, 0).replace(/^1\. /, ""));
    lines.push("", "## 이미 나온 질문 — 여기서 벗어나야 한다");
    lines.push(...input.previousTexts.map((text) => `- ${text}`));
    lines.push("", "다른 각도에서 하나만 다시 물어라.");

    const { data } = await this.#ai.complete(
      {
        contract: "question_draft",
        system: REWRITE_SYSTEM,
        prompt: lines.join("\n"),
        promptVersion: QUESTION_PROMPT_VERSION,
      },
      InterviewQuestionRewriteSchema,
    );
    return data;
  }
}

function retryNote(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  return `직전 시도는 거절되었다. 사유: ${detail}\n같은 실수를 반복하지 말고 다시 써라.`;
}

/**
 * 공고가 이 말을 몇 번 꺼냈는지 센다.
 *
 * 요건 라벨에서 가장 긴 낱말을 뽑아 원문에서 세는 것뿐이다. 모델이 짐작한
 * 숫자가 아니라 **우리가 센 숫자**라 rationale에 그대로 실을 수 있다.
 */
export function countMentions(
  label: string,
  descriptionRaw: string,
): { term: string; count: number } | null {
  const terms = label.match(/[A-Za-z][A-Za-z0-9.+#-]{2,}|[가-힣]{2,}/g) ?? [];
  // 가장 긴 낱말을 고르되, 길이가 같으면 **뒤엣것**을 쓴다. 한국어는 수식어가
  // 앞이고 핵심 명사가 뒤라, "데이터 정합성"에서 세어야 하는 말은 정합성이다.
  const term = terms.reduce<string | null>(
    (best, candidate) => (best === null || candidate.length >= best.length ? candidate : best),
    null,
  );
  if (!term) return null;
  const haystack = descriptionRaw.toLowerCase();
  const needle = term.toLowerCase();
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index >= 0) {
    count += 1;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count > 0 ? { term, count } : null;
}
