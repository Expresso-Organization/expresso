import { API_PREFIX, CareerViewListResponseSchema, ReorderCareerViewsSchema } from "@expresso/contracts";

import { API_BASE_URL } from "@/lib/api/client";
import { readAccessToken } from "@/lib/session";


/** 뷰 탭 순서. 서버는 모든 뷰 버전과 카테고리 버전을 올린다. */
export async function POST(request: Request, { params }: { params: Promise<{ categoryId: string }> }): Promise<Response> {
  const token = await readAccessToken();
  if (!token) return new Response(null, { status: 401 });
  const body = ReorderCareerViewsSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return new Response(null, { status: 400 });
  const { categoryId } = await params;
  const upstream = await fetch(`${API_BASE_URL}${API_PREFIX}/career/categories/${encodeURIComponent(categoryId)}/view-configurations/reorder`, { method: "POST", headers: { authorization: `Bearer ${token}`, accept: "application/json", "content-type": "application/json", "if-match": request.headers.get("if-match") ?? "" }, body: JSON.stringify(body.data), signal: request.signal, cache: "no-store" });
  if (!upstream.ok) return new Response(null, { status: upstream.status });
  try { return Response.json(CareerViewListResponseSchema.parse(await upstream.json())); }
  catch { return new Response(null, { status: 502 }); }
}
