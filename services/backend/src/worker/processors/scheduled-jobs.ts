import type { Job } from "bullmq";
import { type SchedulingApi } from "../../modules/scheduling/index.js";

export function createScheduledJobProcessor(service: SchedulingApi) {
  return async (job: Job<Record<string, unknown>>) => {
    const id = job.data.scheduledRunId;
    if (typeof id !== "string") throw new Error("scheduled.execute payload is missing scheduledRunId");
    return service.process(id);
  };
}

