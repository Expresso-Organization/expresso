import { AiProposalApplyRejectionSchema, ApiErrorResponseSchema, CareerWriteOperationSchema, type CareerWriteOperation } from "@expresso/contracts";
export function publicWriteOperationFromError(value: unknown, producer: CareerWriteOperation["producer"], recordId?: string): CareerWriteOperation | null {
  const error = ApiErrorResponseSchema.safeParse(value);
  if (!error.success) return null;
  const operation = CareerWriteOperationSchema.safeParse(error.data.error.details?.operation);
  if (!operation.success || operation.data.producer !== producer || (recordId && operation.data.recordId !== recordId)) return null;
  return operation.data;
}
export function publicAiApplyRejectionFromError(value:unknown,recordId:string,proposalId:string) {
  const error=ApiErrorResponseSchema.safeParse(value);
  if(!error.success || error.data.error.code!=="CONFLICT" || error.data.error.details?.operation!==undefined)return null;
  const rejection=AiProposalApplyRejectionSchema.safeParse(error.data.error.details?.aiApplyRejection);
  return rejection.success && rejection.data.recordId===recordId && rejection.data.proposalId===proposalId ? rejection.data : null;
}
export async function forwardWriteOperationError(response: Response, producer: CareerWriteOperation["producer"], recordId?: string, proposalId?:string): Promise<Response> {
  const value: unknown = await response.json().catch(() => null);
  const operation = publicWriteOperationFromError(value, producer, recordId);
  const aiApplyRejection=producer==="ai-proposal" && response.status===409 && recordId && proposalId
    ? publicAiApplyRejectionFromError(value,recordId,proposalId) : null;
  if (!operation && !aiApplyRejection) return new Response(null, { status: response.status, headers: { "cache-control": "no-store" } });
  const parsed = ApiErrorResponseSchema.parse(value);
  return Response.json({ error: { code: parsed.error.code, message: parsed.error.message, requestId: parsed.error.requestId, details: operation ? { operation } : { aiApplyRejection } } }, { status: response.status, headers: { "cache-control": "no-store" } });
}
