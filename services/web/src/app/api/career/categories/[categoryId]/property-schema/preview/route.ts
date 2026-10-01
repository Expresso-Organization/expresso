import { API_PREFIX, CareerPropertyChangePreviewSchema, CareerPropertySchemaChangeSchema } from "@expresso/contracts";
import { z } from "zod";
import { API_BASE_URL } from "@/lib/api/client";
import { readAccessToken } from "@/lib/session";

import { isCareerPropertyMutationEnabledForMvp, usesSpringPropertyMutation } from "../spring-property-create";

export async function POST(request: Request, { params }: { params: Promise<{ categoryId: string }> }): Promise<Response> {
  const accessToken = await readAccessToken(); if (!accessToken) return new Response(null, { status: 401 });
  const input = CareerPropertySchemaChangeSchema.safeParse(await request.json().catch(() => null)); if (!input.success) return new Response(null, { status: 400 });
  if (!isCareerPropertyMutationEnabledForMvp(input.data)) return new Response(null, { status: 404 });
  const { categoryId } = await params;
  const springApiBaseUrl = process.env.CAREER_SPRING_API_BASE_URL;
  const useSpring = usesSpringPropertyMutation(input.data);
  if (useSpring && !springApiBaseUrl) return new Response("Spring Career API 주소가 설정되지 않았습니다", { status: 503 });
  const upstreamBaseUrl = useSpring ? springApiBaseUrl : API_BASE_URL;
  const upstream = await fetch(`${upstreamBaseUrl}${API_PREFIX}/career/categories/${encodeURIComponent(categoryId)}/property-schema/preview`, { method: "POST", headers: { authorization: `Bearer ${accessToken}`, accept: "application/json", "content-type": "application/json" }, body: JSON.stringify(input.data), signal: request.signal, cache: "no-store" });
  if (!upstream.ok) return new Response(upstream.body, { status: upstream.status, headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" } });
  try { return Response.json(z.strictObject({ data: CareerPropertyChangePreviewSchema }).parse(await upstream.json())); } catch { return new Response(null, { status: 502 }); }
}
