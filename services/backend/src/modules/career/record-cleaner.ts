import {
  RECORD_STAR_KEYS,
  RecordCleanupSchema,
  type RecordCleanup,
} from "@expresso/contracts";

import { AiError, type AiClient } from "../../platform/ai/client.js";
import { ungroundedNumbers } from "../../platform/numbers.js";

/**
 * §8.3 「기록 정리」 계약.
 *
 * 지금까지 대화 답변은 **그대로** 기록이 됐다 — 제목은 첫 줄을 120자로 자른
 * 것이었고 본문은 발화 원문, 속성은 비어 있었다. 나중에 그 기록을 재료로 쓸 때
 * "무엇에 대한 기록인지"를 알 수 없었다.
 *
 * 이 계약이 하는 일은 **정리**지 창작이 아니다. §8.3이 붙인 조항 둘 —
 * 사용자가 말하지 않은 수치를 만들지 않고, 비어 있는 항목은 null로 둔다.
 * 그래서 STAR 네 칸이 전부 nullable이고, 지어낸 수치는 검증에서 걸린다.
 */

/** 프롬프트를 고치면 올린다. */
export const RECORD_CLEANUP_PROMPT_VERSION = 1;

export class RecordCleanupError extends Error {
  constructor(message: string, options: { cause?: unknown } = {}) {
    super(message, options.cause === undefined ? {} : { cause: options.cause });
    this.name = "RecordCleanupError";
  }
}

export interface CleanupContext {
  /** 무엇을 물었나. 답변만으로는 무엇에 대한 이야기인지 모를 때가 있다. */
  question: string;
  /** 사용자가 말한 것. 이 글 밖의 수치는 존재하지 않는다. */
  transcript: string;
  /** 이미 있던 기록. 답을 고쳐 쓰면 이 위에 덧쓴다. */
  existing: { title: string; bodyMd: string } | null;
}

export interface RecordCleaner {
  clean(context: CleanupContext): Promise<RecordCleanup>;
}

const SYSTEM = [
  "너는 사람이 말한 것을 **정리**한다. 새로 쓰는 것이 아니다.",
  "면접 질문 하나와 그 답변이 주어진다. 나중에 포트폴리오 재료로 쓸 수 있게",
  "제목을 붙이고 STAR로 나눈다.",
  "",
  "## 지어내지 않는다",
  "- **말하지 않은 수치를 만들지 않는다.** 답변에 없는 숫자가 하나라도 있으면",
  "  이 정리는 통째로 버려진다. \"약 30% 개선\" 같은 어림값을 붙이지 않는다.",
  "- **비어 있는 항목은 null로 둔다.** 상황을 말하지 않았으면 situation은 null이다.",
  "  네 칸을 채우려고 없는 이야기를 만들지 않는다. 빈 칸은 나중에 다시 물으면 된다.",
  "- 답변에 없는 도구 · 조직 · 역할을 덧붙이지 않는다.",
  "",
  "## STAR",
  "- situation: 어떤 상황이었나. 문제 · 배경 · 시점.",
  "- task: 그중 무엇을 맡았나. 본인의 몫.",
  "- action: 실제로 무엇을 했나. 이 칸이 대개 가장 길다.",
  "- result: 어떻게 되었나. 답변이 결과를 말하지 않았으면 null이다.",
  "",
  "## 제목",
  "무엇에 대한 기록인지 한 줄. 답변 첫 문장을 자른 것이 아니라,",
  "나중에 목록에서 보고 무슨 이야기인지 알 수 있는 이름이어야 한다.",
  "\"경험\" · \"프로젝트\" 같은 아무 기록에나 붙는 말은 제목이 아니다.",
  "",
  "## metrics · competencies",
  "- metrics: 답변에 **실제로 적힌** 수치를 그대로 옮긴다(\"일 1,200만 건\").",
  "  없으면 빈 배열이다. 만들어 넣지 않는다.",
  "- competencies: 이 이야기가 보여주는 역량. 답변이 말한 행동에서만 뽑는다.",
  "",
  "말투는 답변을 쓴 사람의 것을 따른다. 존댓말이면 존댓말로 정리한다.",
].join("\n");

function buildPrompt(context: CleanupContext): string {
  const lines = [`질문: ${context.question}`, "", "답변:", context.transcript];
  if (context.existing) {
    lines.push(
      "",
      "## 이미 있던 기록 — 답을 고쳐 썼다. 이 위에 덧쓴다",
      `제목: ${context.existing.title}`,
      context.existing.bodyMd,
    );
  }
  lines.push("", "이 답변을 기록으로 정리해라.");
  return lines.join("\n");
}

/** 정리본에 적힌 수가 전부 발화 안에 있는가. */
function inventedNumbers(cleanup: RecordCleanup, source: string): string[] {
  const written = [
    cleanup.title,
    ...RECORD_STAR_KEYS.map((key) => cleanup[key] ?? ""),
    ...cleanup.metrics,
    ...cleanup.competencies,
  ].join("\n");
  return ungroundedNumbers(written, source);
}

export class AiRecordCleaner implements RecordCleaner {
  readonly #ai: AiClient;

  constructor(ai: AiClient) {
    this.#ai = ai;
  }

  async clean(context: CleanupContext): Promise<RecordCleanup> {
    const source = [
      context.transcript,
      context.existing?.title ?? "",
      context.existing?.bodyMd ?? "",
    ].join("\n");
    const prompt = buildPrompt(context);
    let lastError: unknown;

    for (const attempt of [1, 2]) {
      try {
        const { data } = await this.#ai.complete(
          {
            contract: "record_cleanup",
            system: SYSTEM,
            prompt: attempt === 1 ? prompt : `${prompt}\n\n${retryNote(lastError)}`,
            promptVersion: RECORD_CLEANUP_PROMPT_VERSION,
          },
          RecordCleanupSchema,
        );
        const invented = inventedNumbers(data, source);
        if (invented.length > 0) {
          throw new RecordCleanupError(`답변에 없는 수치입니다: ${invented.join(", ")}`);
        }
        return data;
      } catch (error) {
        if (error instanceof AiError && error.code !== "AI_INVALID_OUTPUT") throw error;
        lastError = error;
      }
    }
    throw new RecordCleanupError(
      `기록 정리가 두 번 모두 계약을 벗어났습니다: ${String(lastError)}`,
      { cause: lastError },
    );
  }
}

function retryNote(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  return `직전 시도는 거절되었다. 사유: ${detail}\n같은 실수를 반복하지 말고 다시 정리해라.`;
}

/**
 * 정리본을 `record.properties`로 편다.
 *
 * null과 빈 배열은 넣지 않는다 — 카테고리가 선언한 자리라도 **비어 있는 값을
 * 저장하면 "없다"와 "안 물어봤다"가 구분되지 않는다.**
 */
export function cleanupProperties(cleanup: RecordCleanup): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  for (const key of RECORD_STAR_KEYS) {
    const value = cleanup[key];
    if (value) properties[key] = value;
  }
  if (cleanup.metrics.length > 0) properties["metrics"] = cleanup.metrics;
  if (cleanup.competencies.length > 0) properties["competencies"] = cleanup.competencies;
  return properties;
}

/** 정리본이 채운 칸의 이름. 04c 변경 요약이 이 배열을 그대로 쓴다. */
export function cleanupChangedFields(cleanup: RecordCleanup): string[] {
  return ["title", "body_md", ...Object.keys(cleanupProperties(cleanup))];
}
