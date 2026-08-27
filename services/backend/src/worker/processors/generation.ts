import type { Job } from "bullmq";
import type { GeneratedPage } from "@expresso/contracts";
import type { LayoutDesigner } from "../../modules/layout/designer.js";
import type { GenerationService } from "../../modules/generation/service.js";
import type { SentenceWriter } from "../../modules/generation/writer.js";
import type { PageGenerator } from "../../modules/page/generator.js";
import type { PageService } from "../../modules/page/service.js";

export function createGenerationProcessor(
  service: GenerationService,
  writer: SentenceWriter,
  designer?: LayoutDesigner | null,
  page?: { service: PageService; generator: PageGenerator } | null,
) {
  return async (job: Job<Record<string, unknown>>) => {
    const id = job.data.generationJobId;
    if (typeof id !== "string") throw new Error("portfolio.generate payload is missing generationJobId");
    if (page) {
      const prepared = await service.prepareFreeHtml(id);
      if (prepared.status.status !== "running" || !prepared.portfolioId) return prepared.status;

      let generated: GeneratedPage;
      try {
        // 생성 작업과 지면 판을 직접 묶는다. 이미 저장된 판이 있으면 생성기를 다시
        // 부르지 않고, 성공 판을 확인한 뒤에만 quota와 done을 함께 확정한다.
        generated = await page.service.generate(
          prepared.userId,
          prepared.portfolioId,
          page.generator,
          { generationJobId: id, streamId: id },
        );
        if (generated.qualityStatus !== "ready") {
          return service.failFreeHtml(id, "PAGE_OUTPUT_INVALID");
        }
      } catch (error) {
        console.error(JSON.stringify({
          level: "warn",
          event: "page.generation_failed",
          generationJobId: id,
          message: error instanceof Error ? error.message : String(error),
        }));
        return service.failFreeHtml(id, "PAGE_GENERATION_FAILED");
      }
      // 사용량 확정 실패는 페이지 호출 실패가 아니다. ready 판은 남기되, quota 같은
      // 작업 전이 오류를 정확히 기록한다. 재전달이 와도 저장된 판을 다시 만들지 않는다.
      try {
        return await service.completeFreeHtml(id, generated);
      } catch (error) {
        console.error(JSON.stringify({
          level: "warn",
          event: "page.generation_completion_failed",
          generationJobId: id,
          message: error instanceof Error ? error.message : String(error),
        }));
        return service.failFreeHtml(id, "GENERATION_REJECTED");
      }
    }
    // 자유 HTML 생성기가 없는 이전 배포만 블록·문장 경로를 유지한다. 정식 워커
    // 흐름에서는 이 분기로 들어오지 않는다.
    return service.process(id, writer, designer);
  };
}
