import type { Job } from "bullmq";

import type { CareerComputationService } from "../../modules/career-computation/index.js";

interface CareerComputationPayload {
  userId: string;
  recordId: string;
  changedPropertyIds: string[];
  sourceRecordVersion: number;
  sourcePropertyVersions?: Record<string, number>;
  sourceSchemaVersion?:number;
  sourceCategoryVersion?:number;
  sourceSchemaFingerprint?:string;
  refreshCause?:string;
}

export function createCareerComputationProcessor(service: CareerComputationService) {
  return async (job: Job<Record<string, unknown>>) => {
    const payload = job.data as Partial<CareerComputationPayload>;
    const sourceRecordVersion = payload.sourceRecordVersion;
    if (typeof payload.userId !== "string" || typeof payload.recordId !== "string" || !Array.isArray(payload.changedPropertyIds) || !payload.changedPropertyIds.every((item) => typeof item === "string") || typeof sourceRecordVersion !== "number" || !Number.isInteger(sourceRecordVersion)) throw new Error("career.computation payload is invalid");
    const sourcePropertyVersions = payload.sourcePropertyVersions;
    if (sourcePropertyVersions !== undefined && (!sourcePropertyVersions || typeof sourcePropertyVersions !== "object" || Array.isArray(sourcePropertyVersions) || Object.values(sourcePropertyVersions).some((version) => typeof version !== "number" || !Number.isInteger(version) || version < 1))) throw new Error("career.computation property versions are invalid");
    for(const version of [payload.sourceSchemaVersion,payload.sourceCategoryVersion])if(version!==undefined && (!Number.isSafeInteger(version) || version<1))throw new Error("career.computation schema version is invalid");
    if(payload.sourceSchemaFingerprint!==undefined && (typeof payload.sourceSchemaFingerprint!=="string" || !/^[a-f0-9]{64}$/.test(payload.sourceSchemaFingerprint)))throw new Error("career.computation schema fingerprint is invalid");
    if(payload.refreshCause!==undefined && (typeof payload.refreshCause!=="string" || payload.refreshCause.length>200))throw new Error("career.computation refresh cause is invalid");
    return service.recompute({ eventId: String(job.id ?? `career-computation-${payload.recordId}-${sourceRecordVersion}`), userId: payload.userId, recordId: payload.recordId, changedPropertyIds: payload.changedPropertyIds, sourceRecordVersion, ...(sourcePropertyVersions ? { sourcePropertyVersions } : {}),...(payload.sourceSchemaVersion===undefined?{}:{sourceSchemaVersion:payload.sourceSchemaVersion}),...(payload.sourceCategoryVersion===undefined?{}:{sourceCategoryVersion:payload.sourceCategoryVersion}),...(payload.sourceSchemaFingerprint===undefined?{}:{sourceSchemaFingerprint:payload.sourceSchemaFingerprint}),...(payload.refreshCause===undefined?{}:{refreshCause:payload.refreshCause}) });
  };
}
