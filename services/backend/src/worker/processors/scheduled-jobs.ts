import type { Job } from "bullmq";
import type { SchedulingService } from "../../modules/scheduling/service.js";

export function createScheduledJobProcessor(service: SchedulingService) {
  return async (job: Job<Record<string, unknown>>) => {
    const id = job.data.scheduledRunId;
    if (typeof id !== "string") throw new Error("scheduled.execute payload is missing scheduledRunId");
    return service.process(id);
  };
}

