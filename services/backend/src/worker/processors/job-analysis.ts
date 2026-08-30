import type { Job } from "bullmq";

import { type JobAnalysisApi } from "../../modules/job-analysis/index.js";
import type { RequirementExtractor } from "../../modules/job-analysis/extractor.js";

export interface JobAnalysisJobPayload extends Record<string, unknown> {
  jobAnalysisId: string;
}

export function createJobAnalysisProcessor(
  service: JobAnalysisApi,
  extractor: RequirementExtractor,
) {
  return async (job: Job<Record<string, unknown>>) => {
    if (job.name !== "job.normalize") {
      throw new Error(`Unsupported domain job: ${job.name}`);
    }
    const jobAnalysisId = job.data.jobAnalysisId;
    if (typeof jobAnalysisId !== "string") {
      throw new Error("job.normalize payload is missing jobAnalysisId");
    }
    const result = await service.process(jobAnalysisId, extractor);
    return {
      jobAnalysisId,
      status: result.analysis.status,
      resultVersion: result.analysis.resultVersion,
    };
  };
}
