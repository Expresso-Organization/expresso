import { API_PREFIX, CareerPropertyChangePreviewSchema, CareerPropertySchemaChangeSchema } from "@expresso/contracts";
import { z } from "zod";
import { API_BASE_URL } from "@/lib/api/client";
import { readAccessToken } from "@/lib/session";

export async function POST(request: Request, { params }: { params: Promise<{ categoryId: string }> }): Promise<Response> {
  const accessToken = await readAccessToken(); if (!accessToken) return new Response(null, { status: 401 });
  const input = CareerPropertySchemaChangeSchema.safeParse(await request.json().catch(() => null)); if (!input.success) return new Response(null, { status: 400 });
  const { categoryId } = await params;
  const upstream = await fetch(`${API_BASE_URL}${API_PREFIX}/career/categories/${encodeURIComponent(categoryId)}/property-schema/preview`, { method: "POST", headers: { authorization: `Bearer ${accessToken}`, accept: "application/json", "content-type": "application/json" }, body: JSON.stringify(input.data), signal: request.signal, cache: "no-store" });
  if (!upstream.ok) return new Response(null, { status: upstream.status });
  try { return Response.json(z.strictObject({ data: CareerPropertyChangePreviewSchema }).parse(await upstream.json())); } catch { return new Response(null, { status: 502 }); }
}
