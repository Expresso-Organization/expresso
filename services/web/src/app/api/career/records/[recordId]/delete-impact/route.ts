import { API_PREFIX, CareerDeleteImpactResponseSchema } from "@expresso/contracts";

import { API_BASE_URL } from "@/lib/api/client";
import { readAccessToken } from "@/lib/session";

/** 기록을 지우기 전에 이 기록을 근거로 쓰는 포트폴리오 수를 받는다. */
export async function GET(request: Request, { params }: { params: Promise<{ recordId: string }> }): Promise<Response> {
  const token = await readAccessToken();
  if (!token) return new Response(null, { status: 401 });
  const { recordId } = await params;
  const upstream = await fetch(`${API_BASE_URL}${API_PREFIX}/career/records/${encodeURIComponent(recordId)}/delete-impact`, { headers: { authorization: `Bearer ${token}`, accept: "application/json" }, signal: request.signal, cache: "no-store" });
  if (!upstream.ok) return new Response(null, { status: upstream.status });
  try { return Response.json(CareerDeleteImpactResponseSchema.parse(await upstream.json()), { headers: { "cache-control": "no-store" } }); }
  catch { return new Response(null, { status: 502 }); }
}
