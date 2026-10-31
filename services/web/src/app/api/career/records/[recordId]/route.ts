import { API_PREFIX, CareerRecordResponseSchema, CareerWriteOperationResponseSchema, IdempotencyKeySchema, UuidSchema, UpdateCareerRecordSchema } from "@expresso/contracts";
import { API_BASE_URL } from "@/lib/api/client";
import { forwardWriteOperationError } from "@/lib/api/write-operation-errors";
import { readAccessToken } from "@/lib/session";

export async function GET(request: Request, { params }: { params: Promise<{ recordId: string }> }): Promise<Response> {
  const accessToken = await readAccessToken();
  if (!accessToken) return new Response("로그인이 필요합니다", { status: 401 });
  const { recordId } = await params;
  const upstream = await fetch(`${API_BASE_URL}${API_PREFIX}/career/records/${encodeURIComponent(recordId)}`, { headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" }, signal: request.signal, cache: "no-store" });
  if (!upstream.ok) return new Response(null, { status: upstream.status });
  try { return Response.json(CareerRecordResponseSchema.parse(await upstream.json()), { headers: { "cache-control": "no-store", etag: upstream.headers.get("etag") ?? "" } }); }
  catch { return new Response("백엔드 응답이 계약과 다릅니다", { status: 502 }); }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ recordId: string }> }): Promise<Response> {
  const accessToken = await readAccessToken();
  if (!accessToken) return new Response("로그인이 필요합니다", { status: 401 });
  const parsed = UpdateCareerRecordSchema.safeParse(await request.json().catch(() => null));
  const { recordId } = await params, key = request.headers.get("idempotency-key");
  if (!parsed.success || !UuidSchema.safeParse(recordId).success || key !== null && !IdempotencyKeySchema.safeParse(key).success) return new Response("값을 확인해 주세요", { status: 400 });
  const upstream = await fetch(API_BASE_URL + API_PREFIX + "/career/records/" + encodeURIComponent(recordId), {
    method: "PATCH", headers: { authorization: "Bearer " + accessToken, accept: "application/json", "content-type": "application/json",
      "if-match": request.headers.get("if-match") ?? "", ...(key ? { "idempotency-key": key } : {}) },
    body: JSON.stringify(parsed.data), signal: request.signal, cache: "no-store",
  });
  if (!upstream.ok) return forwardWriteOperationError(upstream, "career-product", recordId);
  try {
    if (upstream.status === 202) {
      const operation = CareerWriteOperationResponseSchema.parse(await upstream.json());
      if (operation.data.producer !== "career-product" || operation.data.recordId !== recordId || !["pending", "running", "retry"].includes(operation.data.state)) return new Response(null, { status: 502 });
      return Response.json(operation, { status: 202, headers: { location: operation.data.statusUrl, "cache-control": "no-store" } });
    }
    const result = CareerRecordResponseSchema.parse(await upstream.json());
    if (result.data.id !== recordId) return new Response(null, { status: 502 });
    return Response.json(result, { headers: { "cache-control": "no-store", etag: upstream.headers.get("etag") ?? "" } });
  } catch { return new Response("백엔드 응답이 계약과 다릅니다", { status: 502 }); }
}
export async function DELETE(request: Request, { params }: { params: Promise<{ recordId: string }> }): Promise<Response> {
  const accessToken = await readAccessToken();
  if (!accessToken) return new Response("로그인이 필요합니다", { status: 401 });
  const { recordId } = await params;
  const upstream = await fetch(`${API_BASE_URL}${API_PREFIX}/career/records/${encodeURIComponent(recordId)}`, { method: "DELETE", headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" }, signal: request.signal, cache: "no-store" });
  if (!upstream.ok) return new Response(null, { status: upstream.status });
  return new Response(null, { status: 204 });
}
