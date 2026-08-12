import { z } from "zod";

import { AiError, type AiClient } from "../../platform/ai/client.js";

/**
 * §8.3 「분석 해설」 계약.
 *
 * 지금까지 해설은 한 문장 템플릿이었다 —
 * `${start}부터 ${end}까지 방문 N건 중 완독 M건이 집계되었습니다`. 숫자를 다시
 * 읽어 주는 것이지 해설이 아니었고, 제안도 늘 같은 한 줄이었다.
 *
 * 이 자리에서 지켜야 하는 것은 **집계에 있는 것만 말하기**다. 방문자 분석은
 * 표본이 작으면 아무 말이나 할 수 있게 되는데, 그래서 §8.3이 두 가지를 못 박았다 —
 * **표본 30 미만이면 해설 자체를 내지 않고**, 해설은 **두 문장 이내**다.
 * 앞의 것은 서비스가 막고(계약을 아예 부르지 않는다), 뒤의 것은 여기서 막는다.
 */

/** 프롬프트를 고치면 올린다. */
export const INSIGHT_PROMPT_VERSION = 1;

export class InsightDraftError extends Error {
  constructor(message: string, options: { cause?: unknown } = {}) {
    super(message, options.cause === undefined ? {} : { cause: options.cause });
    this.name = "InsightDraftError";
  }
}

/** 모델이 내는 초안. 저장 모양(`InsightSchema`)에서 기간과 표본을 뺀 것이다. */
export const InsightNoteSchema = z.strictObject({
  /** 두 문장 이내. 집계에 있는 값만 말한다. */
  narrative: z.string().trim().min(1).max(400),
  /** 이 해설이 무엇을 보고 한 말인지. 집계에 있는 지표 키. */
  evidenceMetrics: z.array(z.string().min(1).max(80)).min(1).max(6),
  suggestions: z.array(z.strictObject({
    direction: z.enum(["up", "down"]),
    target: z.string().min(1).max(80),
    action: z.string().trim().min(1).max(300),
  })).max(2),
});

export type InsightNote = z.infer<typeof InsightNoteSchema>;

export interface InsightContext {
  period: { start: string; end: string };
  sampleSize: number;
  /** 기간 합계. 키가 곧 evidenceMetrics에 쓸 수 있는 이름이다. */
  metrics: Record<string, number>;
  /** 섹션별 체류. 어디서 읽히고 어디서 멈추는지. */
  sections: { title: string; views: number; dwellMs: number }[];
  /** 어디서 왔나. */
  referrers: { origin: string; visits: number }[];
  /** 어느 조직에서 봤나. */
  domains: { domain: string; visits: number }[];
}

export interface InsightWriter {
  write(context: InsightContext): Promise<InsightNote>;
}

const SYSTEM = [
  "너는 포트폴리오 방문 집계를 읽고 **무슨 일이 일어났는지** 짧게 말한다.",
  "",
  "## 절대 규칙 — 집계에 있는 것만 말한다",
  "- 주어진 숫자 밖의 이야기를 하지 않는다. 없는 지표를 지어내지 않는다.",
  "- **추측하지 않는다.** \"아마\" · \"~일 것\" · \"가능성이\" 같은 말을 쓰면 거절된다.",
  "  방문자가 왜 그랬는지는 알 수 없다. 무엇을 했는지만 안다.",
  "- evidenceMetrics는 **지표 이름의 목록**이다. 값을 붙이지 않는다 —",
  "  `[\"visits\", \"completes\"]`이지 `[\"visits: 48\"]`이 아니다.",
  "  아래 \"쓸 수 있는 지표 이름\"에 있는 것만 쓴다. suggestions의 target도 같다.",
  "",
  "## narrative",
  "**두 문장 이내.** 첫 문장은 이 기간에 가장 눈에 띄는 사실 하나.",
  "둘째 문장은 그것이 어디서 갈렸는지(섹션 · 유입 · 도메인 중 하나).",
  "숫자를 다시 읽어 주기만 하는 문장은 해설이 아니다 —",
  "\"방문 40건 중 완독 12건입니다\"가 아니라 무엇이 갈렸는지를 말한다.",
  "",
  "## suggestions — 최대 두 개, 없으면 빈 배열",
  "- direction: 그 지표를 올리자(up)는 건지 내리자(down)는 건지.",
  "- target: 움직이려는 지표. **집계에 있는 키**여야 한다.",
  "- action: 무엇을 하면 되는지 한 문장. 포트폴리오에서 **할 수 있는 일**로 쓴다.",
  "  \"홍보를 늘리세요\"는 이 도구로 할 수 없는 일이다.",
  "집계가 말해 주는 것이 없으면 제안하지 않는다. 빈 배열이 정직한 답이다.",
].join("\n");

function buildPrompt(context: InsightContext): string {
  const keys = Object.keys(context.metrics);
  const lines = [
    `기간: ${context.period.start} ~ ${context.period.end} (방문 ${context.sampleSize}건)`,
    "",
    "## 집계",
    ...Object.entries(context.metrics).map(([key, value]) => `- ${key}: ${value}`),
    "",
    `쓸 수 있는 지표 이름: ${keys.join(" · ")}`,
  ];
  if (context.sections.length > 0) {
    lines.push("", "## 섹션별 체류");
    lines.push(...context.sections.map(({ title, views, dwellMs }) =>
      `- ${title || "(제목 없음)"}: ${views}회 · 평균 ${views > 0 ? Math.round(dwellMs / views / 1000) : 0}초`));
  }
  if (context.referrers.length > 0) {
    lines.push("", "## 유입");
    lines.push(...context.referrers.map(({ origin, visits }) => `- ${origin}: ${visits}건`));
  }
  if (context.domains.length > 0) {
    lines.push("", "## 도메인");
    lines.push(...context.domains.map(({ domain, visits }) => `- ${domain}: ${visits}건`));
  }
  lines.push("", "이 기간에 무슨 일이 있었는지 두 문장 이내로 말하라.");
  return lines.join("\n");
}

/** 문장 수. 마침표·물음표·느낌표로 끊는다. */
function sentenceCount(text: string): number {
  return text.split(/[.!?。](?:\s|$)/).filter((part) => part.trim()).length;
}

function complaints(note: InsightNote, context: InsightContext): string[] {
  const found: string[] = [];
  if (sentenceCount(note.narrative) > 2) found.push("해설은 두 문장 이내입니다");

  const keys = new Set(Object.keys(context.metrics));
  const unknownEvidence = note.evidenceMetrics.filter((key) => !keys.has(key));
  if (unknownEvidence.length > 0) {
    found.push(`집계에 없는 지표입니다: ${unknownEvidence.join(", ")}`);
  }
  const unknownTarget = note.suggestions
    .map(({ target }) => target)
    .filter((target) => !keys.has(target));
  if (unknownTarget.length > 0) {
    found.push(`제안이 가리키는 지표가 집계에 없습니다: ${unknownTarget.join(", ")}`);
  }
  return found;
}

export class AiInsightWriter implements InsightWriter {
  readonly #ai: AiClient;

  constructor(ai: AiClient) {
    this.#ai = ai;
  }

  async write(context: InsightContext): Promise<InsightNote> {
    const prompt = buildPrompt(context);
    let lastError: unknown;
    for (const attempt of [1, 2]) {
      try {
        const { data } = await this.#ai.complete(
          {
            contract: "insight_note",
            system: SYSTEM,
            prompt: attempt === 1 ? prompt : `${prompt}\n\n${retryNote(lastError)}`,
            promptVersion: INSIGHT_PROMPT_VERSION,
          },
          InsightNoteSchema,
        );
        const found = complaints(data, context);
        if (found.length > 0) throw new InsightDraftError(found.join(", "));
        return data;
      } catch (error) {
        if (error instanceof AiError && error.code !== "AI_INVALID_OUTPUT") throw error;
        lastError = error;
      }
    }
    throw new InsightDraftError(
      `해설이 두 번 모두 계약을 벗어났습니다: ${String(lastError)}`,
      { cause: lastError },
    );
  }
}

function retryNote(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  return `직전 시도는 거절되었다. 사유: ${detail}\n같은 실수를 반복하지 말고 다시 써라.`;
}
