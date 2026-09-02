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
    return service.compact(payload.recordId, payload.expectedSequence);
  };
}
