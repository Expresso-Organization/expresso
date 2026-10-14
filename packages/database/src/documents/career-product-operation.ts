import type { CareerProducerIntent } from "@expresso/contracts";

/** 사용자 세션은 저장하지 않고 입력 key와 owner별 immutable intent/receipt만 보존합니다. */
export interface CareerProductOperationDoc {
  _id: string;
  userId: string;
  inputIdempotencyKey: string;
  inputHash: string;
  requestHash: string;
  kind: "create" | "patch";
  recordId: string | null;
  writerIntegration: CareerProducerIntent;
  active: boolean;
  result: { recordId: string; version: number } | null;
  createdAt: Date;
  updatedAt: Date;
}
