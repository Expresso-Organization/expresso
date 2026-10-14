import { ApiErrorResponseSchema, CareerWriteOperationSchema, type CareerWriteOperation } from "@expresso/contracts";
export function publicWriteOperationFromError(value: unknown, producer: CareerWriteOperation["producer"], recordId?: string): CareerWriteOperation | null {
  const error = ApiErrorResponseSchema.safeParse(value);
  if (!error.success) return null;
  const operation = CareerWriteOperationSchema.safeParse(error.data.error.details?.operation);
  if (!operation.success || operation.data.producer !== producer || (recordId && operation.data.recordId !== recordId)) return null;
  return operation.data;
}
export async function forwardWriteOperationError(response: Response, producer: CareerWriteOperation["producer"], recordId?: string): Promise<Response> {
  const value: unknown = await response.json().catch(() => null);
  const operation = publicWriteOperationFromError(value, producer, recordId);
  if (!operation) return new Response(null, { status: response.status, headers: { "cache-control": "no-store" } });
  const parsed = ApiErrorResponseSchema.parse(value);
  return Response.json({ error: { code: parsed.error.code, message: parsed.error.message, requestId: parsed.error.requestId, details: { operation } } }, { status: response.status, headers: { "cache-control": "no-store" } });
}
