import { API_PREFIX, ApplyCareerPropertyChangeSchema, CareerCategorySchema } from "@expresso/contracts";
import { z } from "zod";
import { API_BASE_URL } from "@/lib/api/client";
import { readAccessToken } from "@/lib/session";

export async function POST(request: Request, { params }: { params: Promise<{ categoryId: string }> }): Promise<Response> {
  const accessToken = await readAccessToken(); if (!accessToken) return new Response(null, { status: 401 });
  const input = ApplyCareerPropertyChangeSchema.safeParse(await request.json().catch(() => null)); if (!input.success) return new Response(null, { status: 400 });
  const { categoryId } = await params;
  const upstream = await fetch(`${API_BASE_URL}${API_PREFIX}/career/categories/${encodeURIComponent(categoryId)}/property-schema/apply`, { method: "POST", headers: { authorization: `Bearer ${accessToken}`, accept: "application/json", "content-type": "application/json", "if-match": request.headers.get("if-match") ?? "", "idempotency-key": request.headers.get("idempotency-key") ?? "" }, body: JSON.stringify(input.data), signal: request.signal, cache: "no-store" });
  if (!upstream.ok) return new Response(null, { status: upstream.status });
  try { return Response.json(z.strictObject({ data: CareerCategorySchema }).parse(await upstream.json()), { headers: { etag: upstream.headers.get("etag") ?? "" } }); } catch { return new Response(null, { status: 502 }); }
}
