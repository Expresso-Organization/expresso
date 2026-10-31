import { API_PREFIX, CareerPropertyMutationStatusResponseSchema, UuidSchema } from "@expresso/contracts";
import { API_BASE_URL } from "@/lib/api/client";
import { readAccessToken } from "@/lib/session";

export async function GET(request: Request, { params }: { params: Promise<{ mutationId: string }> }): Promise<Response> {
  const token = await readAccessToken();
  if (!token) return new Response(null, { status: 401 });
  const id = UuidSchema.safeParse((await params).mutationId);
  if (!id.success) return new Response(null, { status: 400 });
  const response = await fetch(API_BASE_URL + API_PREFIX + "/career/property-mutations/" + id.data, {
    headers: { authorization: "Bearer " + token, accept: "application/json" }, cache: "no-store", signal: request.signal,
  });
  if (!response.ok) return new Response(null, { status: response.status });
  try {
    const result = CareerPropertyMutationStatusResponseSchema.parse(await response.json());
    if (result.data.id !== id.data) return new Response(null, { status: 502 });
    return Response.json(result, { headers: { "cache-control": "no-store" } });
  } catch { return new Response(null, { status: 502 }); }
}