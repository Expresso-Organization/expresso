import { API_PREFIX, CareerCategoryResponseSchema, DeleteCareerCategoryQuerySchema, UpdateCareerCategorySchema } from "@expresso/contracts";

import { API_BASE_URL } from "@/lib/api/client";
import { readAccessToken } from "@/lib/session";

/** 보관 · 보관 해제. */
export async function PATCH(request: Request, { params }: { params: Promise<{ categoryId: string }> }): Promise<Response> {
  const token = await readAccessToken();
  if (!token) return new Response(null, { status: 401 });
  const { categoryId } = await params;
  const body = UpdateCareerCategorySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return new Response(null, { status: 400 });
  const upstream = await fetch(`${API_BASE_URL}${API_PREFIX}/career/categories/${encodeURIComponent(categoryId)}`, {
    method: "PATCH",
    headers: { authorization: `Bearer ${token}`, accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(body.data),
    cache: "no-store",
  });
  if (!upstream.ok) return new Response(null, { status: upstream.status });
  try { return Response.json(CareerCategoryResponseSchema.parse(await upstream.json())); }
  catch { return new Response(null, { status: 502 }); }
}

/** DELETE에는 본문이 없다. content-type을 붙이면 Fastify가 빈 JSON 본문으로 보고 400을 낸다. */
export async function DELETE(request: Request, { params }: { params: Promise<{ categoryId: string }> }): Promise<Response> {
  const token = await readAccessToken();
  if (!token) return new Response(null, { status: 401 });
  const { categoryId } = await params;
  const query = DeleteCareerCategoryQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!query.success) return new Response(null, { status: 400 });
  const upstream = await fetch(`${API_BASE_URL}${API_PREFIX}/career/categories/${encodeURIComponent(categoryId)}?deleteRecords=${query.data.deleteRecords}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${token}`, accept: "application/json" },
    cache: "no-store",
  });
  return new Response(null, { status: upstream.ok ? 204 : upstream.status });
}
