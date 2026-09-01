import type { Job } from "bullmq";
import { type PublishingApi } from "../../modules/publishing/index.js";

export function createExportProcessor(service: PublishingApi) {
  return async (job: Job<Record<string, unknown>>) => {
    const id = job.data.exportJobId;
    if (typeof id !== "string") throw new Error("portfolio.export payload is missing exportJobId");
    return service.processExport(id);
  };
}

