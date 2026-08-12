import type { Job } from "bullmq";
import type { PublishingService } from "../../modules/publishing/service.js";

export function createExportProcessor(service: PublishingService) {
  return async (job: Job<Record<string, unknown>>) => {
    const id = job.data.exportJobId;
    if (typeof id !== "string") throw new Error("portfolio.export payload is missing exportJobId");
    return service.processExport(id);
  };
}

