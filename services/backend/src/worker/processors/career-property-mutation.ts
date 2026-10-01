import type { Job } from "bullmq";

import {
  type CareerPropertyMutationTopic,
  MongoCareerPropertyMutationService,
} from "../../modules/career/property-mutation.js";

const SUPPORTED_TOPICS = new Set<CareerPropertyMutationTopic>([
  "career.property-conversion",
  "career.property-default",
  "career.property-deletion",
  "career.property-restoration",
]);

export function createCareerPropertyMutationProcessor(service: MongoCareerPropertyMutationService) {
  return async (job: Job<Record<string, unknown>>) => {
    if (!SUPPORTED_TOPICS.has(job.name as CareerPropertyMutationTopic)) throw new Error(`지원하지 않는 Career Property 작업입니다: ${job.name}`);
    return service.run(job.name as CareerPropertyMutationTopic, job.data);
  };
}
