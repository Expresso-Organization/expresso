import type { Job } from "bullmq";

import { InterviewCleanupSourceSchema, type InterviewApi } from "../../modules/interview/index.js";

/**
 * §8.3 「기록 정리」.
 *
 * 답변은 이미 저장돼 있다. 여기서 하는 일은 그 위에 제목과 STAR를 얹는 것뿐이고,
 * 실패하면 원문이 초안으로 남는다 — 사용자가 쓴 글은 잃지 않는다.
 */
export function createRecordCleanupProcessor(service: InterviewApi) {
  return async (job: Job<Record<string, unknown>>) => {
    const answerId = job.data.answerId;
    const userId = job.data.userId;
    if (typeof answerId !== "string" || typeof userId !== "string") {
      throw new Error("record.cleanup payload is missing answerId or userId");
    }
    if (service.cleanupAnswerOperation && job.data.operationId !== undefined) {
      const source = InterviewCleanupSourceSchema.parse({ answerId, operationId: job.data.operationId,
        answerVersion: job.data.answerVersion, recordVersion: job.data.recordVersion });
      await service.cleanupAnswerOperation(userId, source);
    } else {
      await service.cleanupAnswer(userId, answerId);
    }
    return {};
  };
}
