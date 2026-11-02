import { API_PREFIX, CareerWriteOperationResponseSchema, UuidSchema } from "@expresso/contracts";
import { API_BASE_URL } from "@/lib/api/client";
import { readAccessToken } from "@/lib/session";
export async function GET(request: Request, { params }: { params: Promise<{ operationId: string }> }) {
  const token = await readAccessToken();
  if (!token) return new Response(null, { status: 401 });
  const id = UuidSchema.safeParse((await params).operationId);
  if (!id.success || new URL(request.url).search || request.headers.has("authorization") || request.headers.has("x-user-id")) return new Response(null, { status: 400 });
  const upstream = await fetch(API_BASE_URL + API_PREFIX + "/career/write-operations/" + encodeURIComponent(id.data), { headers: { authorization: "Bearer " + token, accept: "application/json" }, cache: "no-store", signal: request.signal });
  if (!upstream.ok) return new Response(null, { status: upstream.status });
  try {
    const body = CareerWriteOperationResponseSchema.parse(await upstream.json());
    if (body.data.operationId !== id.data) return new Response(null, { status: 502 });
    return Response.json(body, { headers: { "cache-control": "no-store" } });
  } catch { return new Response(null, { status: 502 }); }
}