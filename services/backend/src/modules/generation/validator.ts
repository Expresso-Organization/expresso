import { GenerationOutputSchema, chartNumbers, type GenerationOutput } from "@expresso/contracts";

import { ungroundedNumbers } from "../../platform/numbers.js";

/**
 * 추출 결과의 근거 검증(§8.3 환각 방지).
 *
 * 예전에는 **문장이 근거 라벨과 글자까지 같아야** 통과했다. 그건 검증이 아니라
 * 복사 강제였고, 그래서 생성기가 레시피 항목을 그대로 베끼는 것 말고는 할 수
 * 있는 일이 없었다.
 *
 * 실제로 지켜야 하는 것은 **지어낸 수치가 없을 것**이다. 문장의 나머지는 글자
 * 비교로 지킬 수 없고 — 지키려 들면 문장을 못 쓴다 — 숫자는 지킬 수 있다.
 * 그래서 규칙은 하나다: **블록에 적힌 숫자는 그 블록이 인용한 근거 안에 있어야
 * 한다.** 인용하지 않은 근거의 숫자를 빌려 올 수도 없다.
 */

export interface GenerationEvidence {
  id: string;
  sourceType: "record" | "requirement" | "answer";
  sourceLabel: string;
  /** 근거 원문. 수치가 실제로 적혀 있는 곳이다. */
  sourceText: string;
}

export class GenerationValidationError extends Error {
  readonly retryable = false;
  constructor(message: string) { super(message); this.name = "GenerationValidationError"; }
}

export function validateGenerationOutput(
  value: unknown,
  evidence: GenerationEvidence[],
  excludedTerms: string[],
  lockedTexts: string[],
): GenerationOutput {
  const output = GenerationOutputSchema.parse(value);
  const evidenceById = new Map(evidence.map((item) => [item.id, item]));

  for (const block of output.blocks) {
    const paths = block.evidencePathIds.map((id) => evidenceById.get(id));
    if (paths.some((path) => !path)) {
      throw new GenerationValidationError("block references evidence outside the recipe");
    }
    const cited = paths.map((path) => `${path?.sourceLabel} ${path?.sourceText}`).join("\n");
    // 그림에 적힌 수도 문장과 같은 규율을 받는다. 눈에 먼저 들어오는 자리라
    // 여기서 지어낸 값이 가장 크게 거짓말한다.
    const claimed = block.chart ? `${block.text} ${chartNumbers(block.chart)}` : block.text;
    const invented = ungroundedNumbers(claimed, cited);
    if (invented.length > 0) {
      throw new GenerationValidationError(
        `generated sentence contains an ungrounded claim or number: ${invented.join(", ")}`,
      );
    }
    if (excludedTerms.some((term) => term && block.text.includes(term))) {
      throw new GenerationValidationError("generated sentence violates a recipe exclusion");
    }
    // 수치 블록은 기록에 붙어야 한다. `block`의 CHECK가 같은 것을 요구하는데,
    // 여기서 걸러야 "왜 실패했는지"가 제약 위반 대신 말로 남는다.
    if (
      (block.kind === "metric" || block.kind === "chart")
      && !paths.some((path) => path?.sourceType === "record")
    ) {
      throw new GenerationValidationError(`${block.kind} block must cite a career record`);
    }
  }

  for (const lockedText of lockedTexts) {
    if (!output.blocks.some(({ text }) => text === lockedText)) {
      throw new GenerationValidationError("generation attempted to change a locked block");
    }
  }
  return output;
}
