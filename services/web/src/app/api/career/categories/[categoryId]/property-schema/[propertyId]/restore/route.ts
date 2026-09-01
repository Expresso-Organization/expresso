import { API_PREFIX, CareerCategorySchema } from "@expresso/contracts";
import { z } from "zod";
import { API_BASE_URL } from "@/lib/api/client";
import { readAccessToken } from "@/lib/session";

export async function POST(request: Request, { params }: { params: Promise<{ categoryId: string; propertyId: string }> }): Promise<Response> {
  const accessToken = await readAccessToken(); if (!accessToken) return new Response(null, { status: 401 });
  const { categoryId, propertyId } = await params;
  const upstream = await fetch(`${API_BASE_URL}${API_PREFIX}/career/categories/${encodeURIComponent(categoryId)}/property-schema/${encodeURIComponent(propertyId)}/restore`, { method: "POST", headers: { authorization: `Bearer ${accessToken}`, accept: "application/json", "if-match": request.headers.get("if-match") ?? "" }, signal: request.signal, cache: "no-store" });
  if (!upstream.ok) return new Response(null, { status: upstream.status });
  try { return Response.json(z.strictObject({ data: CareerCategorySchema }).parse(await upstream.json()), { headers: { etag: upstream.headers.get("etag") ?? "" } }); } catch { return new Response(null, { status: 502 }); }
}
