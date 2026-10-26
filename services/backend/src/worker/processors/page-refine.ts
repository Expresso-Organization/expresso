import type { Job } from "bullmq";

import type { PageRefiner, PageService } from "../../modules/page/service.js";

/**
 * 초안 다듬기.
 *
 * 초안은 이미 저장돼 사용자가 보고 있다. 여기서는 스크린샷을 보고 고친 판이 나으면 새 판으로 저장할 뿐이고,
 * 실패해도 초안이 남는다. AI가 꺼져 있으면 건너뛴 것으로 기록한다.
 */
export function createPageRefineProcessor(service: Pick<PageService, "refine">, refiner: PageRefiner | null) {
  return async (job: Job<Record<string, unknown>>) => {
    const pageId = job.data.pageId;
    const userId = job.data.userId;
    if (typeof pageId !== "string" || typeof userId !== "string") {
      throw new Error("page.refine payload is missing pageId or userId");
    }
    await service.refine(userId, pageId, refiner);
    return {};
  };
}
