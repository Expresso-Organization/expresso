import { CareerRecordListItemSchema, CareerRecordSchema, CareerWriteOperationResponseSchema, type CareerRecord, type CareerWriteOperation } from "@expresso/contracts";
import { publicWriteOperationFromError } from "@/lib/api/write-operation-errors";
import { durableWriteKey, saveOperation, savedOperation } from "./write-operation-client";
export const RECORD_WRITE_PENDING_EVENT = "ex-career-record-write-pending";
export const RECORD_WRITE_HINT = "변경 적용 중입니다. 완료 후 다시 편집할 수 있습니다.";
export const recordWriteScope = (recordId: string) => "career-record:" + recordId + ":update";
export type CareerRecordWriteResult = { kind: "completed"; record: CareerRecord } | { kind: "pending" | "blocked"; operation: CareerWriteOperation };
export function publishPendingRecordWrite(recordId: string, operation: CareerWriteOperation): void {
  saveOperation(recordWriteScope(recordId), operation.operationId);
  window.dispatchEvent(new CustomEvent(RECORD_WRITE_PENDING_EVENT, { detail: { recordId, operation } }));
}
function parsedRecord(value: unknown): CareerRecord {
  const parsed = CareerRecordSchema.safeParse(value);
  return parsed.success ? parsed.data : CareerRecordListItemSchema.parse(value);
}
export async function parseCareerRecordWrite(response: Response, recordId?: string): Promise<CareerRecordWriteResult> {
  if (!response.ok) {
    const operation = response.status === 409 ? publicWriteOperationFromError(await response.clone().json().catch(() => null), "career-product", recordId) : null;
    if (operation) return { kind: "blocked", operation };
    throw Object.assign(new Error(response.status === 409 || response.status === 412 ? "다른 곳에서 바뀐 값과 충돌했습니다." : "값을 저장하지 못했습니다."), { status: response.status });
  }
  const body: unknown = await response.json();
  if (response.status === 202) {
    const operation = CareerWriteOperationResponseSchema.parse(body).data;
    if (operation.producer !== "career-product" || !["pending", "running", "retry"].includes(operation.state) || (recordId && operation.recordId !== recordId)) throw new Error("변경 작업 응답이 요청과 일치하지 않습니다.");
    return { kind: "pending", operation };
  }
  if (!body || typeof body !== "object" || !("data" in body)) throw new Error("기록 응답을 확인하지 못했습니다.");
  const record = parsedRecord(body.data);
  if (recordId && record.id !== recordId) throw new Error("기록 응답이 요청과 일치하지 않습니다.");
  return { kind: "completed", record };
}
export async function readCareerRecord(recordId: string): Promise<CareerRecord> {
  const response = await fetch("/api/career/records/" + recordId, { cache: "no-store" });
  const result = await parseCareerRecordWrite(response, recordId);
  if (result.kind !== "completed") throw new Error("최신 기록을 불러오지 못했습니다.");
  return result.record;
}
export async function patchCareerRecord(recordId: string, version: number, patch: unknown): Promise<CareerRecordWriteResult> {
  if (savedOperation(recordWriteScope(recordId))) throw new Error(RECORD_WRITE_HINT);
  const key = await durableWriteKey(recordWriteScope(recordId), { version, patch });
  const response = await fetch("/api/career/records/" + recordId, { method: "PATCH", headers: { "content-type": "application/json", "if-match": '"v' + version + '"', "idempotency-key": key }, body: JSON.stringify(patch) });
  const result = await parseCareerRecordWrite(response, recordId);
  if (result.kind !== "completed") publishPendingRecordWrite(recordId, result.operation);
  return result;
}
