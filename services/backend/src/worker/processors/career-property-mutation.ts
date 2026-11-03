import type { Job } from "bullmq";

/** 기록이 많은 카테고리의 속성 변경(`career.property-*`)을 끝냅니다. 처리기가 없으면 작업이 실패해 값이 옮겨지지 않습니다. */
export const CAREER_PROPERTY_MUTATION_JOBS = new Set([
  "career.property-conversion",
  "career.property-default",
  "career.property-deletion",
  "career.property-restoration",
]);

export function createCareerPropertyMutationProcessor(service: { processMutation(topic: string, payload: Record<string, unknown>): Promise<{ updated: number }> }) {
  return async (job: Job<Record<string, unknown>>) => service.processMutation(job.name, job.data);
}
