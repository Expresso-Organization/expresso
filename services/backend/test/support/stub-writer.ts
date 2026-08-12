import { GenerationOutputSchema } from "@expresso/contracts";

import type { SentenceWriter, WriterContext } from "../../src/modules/generation/writer.js";

/**
 * 테스트가 쓰는 문장 생성기.
 *
 * **프로덕션 폴백이 아니다.** 아웃라인 항목을 그대로 문단으로 옮기는 이 동작은
 * 예전에 `AI_PROVIDER=off`의 폴백이었고, 그 결과물은 문단만 늘어선 개요였다.
 * 제품에서는 걷어냈고, 여기 남긴 것은 AI 계약 없이도 생성 파이프라인(근거 연결 ·
 * 잠금 · 검증 · 블록 적재)을 끝까지 돌리기 위한 **결정적 대역**이다.
 */
export class StubSentenceWriter implements SentenceWriter {
  readonly usesContract = false;

  async write(context: WriterContext) {
    return GenerationOutputSchema.parse({
      blocks: context.sections.flatMap((section) =>
        section.items.map((item) => ({
          recipeSectionId: section.recipeSectionId,
          kind: "paragraph" as const,
          text: item.pointText,
          label: null,
          evidencePathIds: item.sourceNumbers
            .map((number) => context.evidence[number - 1]?.id)
            .filter((id): id is string => Boolean(id)),
        }))),
    });
  }
}
