import { UnrecoverableError, type Job } from "bullmq";
import { z } from "zod";
import type { EvidenceSearchService } from "../../modules/evidence-search/index.js";
const Payload = z.strictObject({ userId: z.uuid(), recordId: z.uuid().optional() });
export function createEvidenceIndexProcessor(service: Pick<EvidenceSearchService, "sync" | "syncRecord">) {
  return async (job: Pick<Job<Record<string, unknown>>, "name" | "data">): Promise<Record<string, unknown>> => {
    const parsed = Payload.safeParse(job.data);
    if (!parsed.success || !["career.evidence.record", "career.evidence.reindex"].includes(job.name) || (job.name === "career.evidence.record" && !parsed.data.recordId)) throw new UnrecoverableError("invalid evidence index payload");
    try {
      const result = job.name === "career.evidence.record"
        ? await service.syncRecord(parsed.data.userId, parsed.data.recordId!) : await service.sync(parsed.data.userId);
      console.info(JSON.stringify({ level: "info", event: "evidence.index_complete", jobId: job.name, ...result }));
      return result;
    } catch (error) {
      if (error && typeof error === "object" && "statusCode" in error && [401, 403, 404].includes(Number(error.statusCode))) throw new UnrecoverableError("evidence source unavailable");
      // 기존 BullMQ 지수 재시도와 실패 큐·알림 로그를 그대로 사용합니다.
      throw error;
    }
  };
}
