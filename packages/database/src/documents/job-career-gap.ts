import type { CareerGapResult } from "@expresso/contracts";
export interface CareerGapRunDoc {
  _id: string;
  userId: string;
  conversationId: string;
  requestId: string;
  messageIds: string[];
  inputFingerprint: string;
  status: "running" | "completed" | "failed";
  attemptId: string;
  leaseUntil: Date;
  createdAt: Date;
  result: CareerGapResult | null;
}
