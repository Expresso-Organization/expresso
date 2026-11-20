import { ProposalTriggerSchema } from "@expresso/contracts";
import type { Job } from "bullmq";

import type { ProposalApi } from "../../modules/proposals/index.js";

/** 줄에 넣은 능동 제안 실행 하나. 실행하지 않고 끝난 까닭(크레딧 · 동의 · 새 소식 없음)도 결과로 남는다. */
export function createProposalProcessor(service: Pick<ProposalApi, "run">) {
  return async (job: Job<Record<string, unknown>>) => {
    const trigger = ProposalTriggerSchema.safeParse(job.data.trigger);
    if (typeof job.data.userId !== "string" || !trigger.success) throw new Error("proposals.generate payload is invalid");
    return service.run(job.data.userId, trigger.data);
  };
}
