import type { Job } from "bullmq";

import type { CareerDocumentApi } from "../../modules/career-editor/index.js";

interface CareerDocumentCompactionPayload {
  recordId: string;
  expectedSequence: number;
}

export function createCareerDocumentCompactionProcessor(service: CareerDocumentApi) {
  return async (job: Job<Record<string, unknown>>) => {
    const payload = job.data as Partial<CareerDocumentCompactionPayload>;
    if (typeof payload.recordId !== "string" || typeof payload.expectedSequence !== "number") {
      throw new Error("career.document.compact payload is invalid");
    }
    try {
      return await service.compact(payload.recordId, payload.expectedSequence);
    } catch (error) {
      // 입력이 이어지는 동안에는 기대 순번이 낡아 409가 납니다. 다음 저장이 압축을 다시 예약하므로 실패로 쌓지 않습니다.
      if (error && typeof error === "object" && (error as { statusCode?: number }).statusCode === 409) return { skipped: "document advanced during compaction" };
      throw error;
    }
  };
}
