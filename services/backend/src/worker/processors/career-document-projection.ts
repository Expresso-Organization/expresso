import type { Job } from "bullmq";

import type { CareerDocumentService } from "../../modules/career-editor/index.js";

interface CareerDocumentProjectionPayload {
  userId: string;
  recordId: string;
}

/** BlockNote 본문을 bodyMd로 투영합니다. 매칭 · 생성 · 목록 미리보기가 bodyMd를 읽습니다. */
export function createCareerDocumentProjectionProcessor(service: Pick<CareerDocumentService, "projectBodyMarkdown">) {
  return async (job: Job<Record<string, unknown>>) => {
    const payload = job.data as Partial<CareerDocumentProjectionPayload>;
    if (typeof payload.userId !== "string" || typeof payload.recordId !== "string") {
      throw new Error("career.document.project payload is invalid");
    }
    const markdown = await service.projectBodyMarkdown(payload.userId, payload.recordId);
    return { projected: markdown !== null };
  };
}
