import { API_PREFIX, CareerRecordResponseSchema, CareerWriteOperationResponseSchema, CreateCareerRecordSchema, IdempotencyKeySchema } from "@expresso/contracts";
import { API_BASE_URL } from "@/lib/api/client";
import { forwardWriteOperationError } from "@/lib/api/write-operation-errors";
import { readAccessToken } from "@/lib/session";
export async function POST(request: Request) {
  const token = await readAccessToken();
  if (!token) return new Response(null, { status: 401 });
  const body = CreateCareerRecordSchema.safeParse(await request.json().catch(() => null));
  const key = request.headers.get("idempotency-key");
  if (!body.success || key !== null && !IdempotencyKeySchema.safeParse(key).success) return new Response(null, { status: 400 });
  const upstream = await fetch(API_BASE_URL + API_PREFIX + "/career/records", {
    method: "POST", headers: { authorization: "Bearer " + token, accept: "application/json", "content-type": "application/json", "idempotency-key": key ?? "" },
    body: JSON.stringify(body.data), cache: "no-store", signal: request.signal,
  });
  if (!upstream.ok) return forwardWriteOperationError(upstream, "career-product");
  try {
    if (upstream.status === 202) {
      const operation = CareerWriteOperationResponseSchema.parse(await upstream.json());
      if (operation.data.producer !== "career-product" || !["pending", "running", "retry"].includes(operation.data.state)) return new Response(null, { status: 502 });
      return Response.json(operation, { status: 202, headers: { location: operation.data.statusUrl, "cache-control": "no-store" } });
    }
    return Response.json(CareerRecordResponseSchema.parse(await upstream.json()), { headers: { "cache-control": "no-store" } });
  } catch { return new Response(null, { status: 502 }); }
}