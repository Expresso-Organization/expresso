import type { Job } from "bullmq";
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
    const status = await service.process(id, writer, designer);
    const userId = job.data.userId;
    if (
      page
      && status.status === "done"
      && status.portfolioId
      && typeof userId === "string"
      && !(await page.service.latest(userId, status.portfolioId))
    ) {
      // 블록 적재 transaction은 이미 끝났다. 페이지 호출이 실패해도 근거가 연결된
      // 편집 초안은 남고, queue 재시도는 페이지가 없는 경우에만 다시 이 자리를 돈다.
      await page.service.generate(userId, status.portfolioId, page.generator);
    }
    return status;
  };
}
