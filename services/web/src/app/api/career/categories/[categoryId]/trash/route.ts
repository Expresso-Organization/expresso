import { API_PREFIX, CareerTrashListResponseSchema } from "@expresso/contracts";

import { API_BASE_URL } from "@/lib/api/client";
import { readAccessToken } from "@/lib/session";

export async function GET(request: Request, { params }: { params: Promise<{ categoryId: string }> }): Promise<Response> {
  const token = await readAccessToken();
  if (!token) return new Response(null, { status: 401 });
  const { categoryId } = await params;
  const upstream = await fetch(`${API_BASE_URL}${API_PREFIX}/career/categories/${encodeURIComponent(categoryId)}/trash`, { headers: { authorization: `Bearer ${token}`, accept: "application/json" }, signal: request.signal, cache: "no-store" });
  if (!upstream.ok) return new Response(null, { status: upstream.status });
  try { return Response.json(CareerTrashListResponseSchema.parse(await upstream.json()), { headers: { "cache-control": "no-store" } }); }
  catch { return new Response(null, { status: 502 }); }
}
