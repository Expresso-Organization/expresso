import type { CareerRecordDoc } from "./career.js";

export interface CareerPropertyMutationDoc {
  _id: string; userId: string; categoryId: string; propertyId: string;
  planJson: string; operationFingerprint: string;
  status: "pending" | "running" | "failed" | "completed"; active: boolean;
  cursor: number; processedCount: number; skippedCount: number; attempts: number;
  leaseToken: string | null; leaseUntil: Date | null; lastError: string | null;
  commitFence: number;
  createdAt: Date; updatedAt: Date; completedAt: Date | null;
}
export interface CareerPropertyMutationReceiptDoc {
  _id: string; userId: string; mutationId: string; recordId: string; operationFingerprint: string;
  response: Pick<CareerRecordDoc, "_id" | "userId" | "categoryId" | "title" | "status" | "propertyValues" | "version" | "updatedAt">;
  changed: boolean; createdAt: Date;
}
