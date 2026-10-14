import type { Job } from "bullmq";
import { UuidSchema } from "@expresso/contracts";
import type { CareerComputationTargetStateService } from "../../modules/career-computation/index.js";

/** B2 전환에서 연결할 derived invalidation consumer입니다. Bootstrap에 등록하지 않습니다. */
export function createCareerComputationTargetStateProcessor(service:CareerComputationTargetStateService) {
  return async(job:Job<Record<string,unknown>>)=>{
    const {userId,targetRecordId,targetRecordVersion}=job.data;
    if(!UuidSchema.safeParse(userId).success || !UuidSchema.safeParse(targetRecordId).success || typeof targetRecordVersion!=="number" || !Number.isSafeInteger(targetRecordVersion) || targetRecordVersion<1)throw new Error("career.computation.target-state payload is invalid");
    await service.invalidateTargetState(userId as string,targetRecordId as string,targetRecordVersion);
  };
}
