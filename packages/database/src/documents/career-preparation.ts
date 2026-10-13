import type { PreparationPlan } from "@expresso/contracts";
export interface PreparationPlanDoc {
  _id: string; userId: string; conversationId: string; requestId: string;
  inputFingerprint: string; version: number; status: PreparationPlan["status"];
  createdAt: Date; result: PreparationPlan;
}
