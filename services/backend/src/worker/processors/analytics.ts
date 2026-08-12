import type { Job } from "bullmq";
import type { AnalyticsService } from "../../modules/analytics/service.js";

export function createAnalyticsProcessor(service: AnalyticsService) {
  return async (job: Job<Record<string, unknown>>) => {
    const deploymentId = job.data.deploymentId;
    const date = job.data.date;
    if (typeof deploymentId !== "string" || typeof date !== "string") throw new Error("analytics.aggregate payload is invalid");
    return service.aggregateDay(deploymentId, date);
  };
}

