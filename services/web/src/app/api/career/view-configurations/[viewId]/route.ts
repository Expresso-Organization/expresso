import { API_PREFIX, CareerViewResponseSchema, UpdateCareerViewConfigurationSchema } from "@expresso/contracts";

import { API_BASE_URL } from "@/lib/api/client";
import { readAccessToken } from "@/lib/session";

/** DELETE에는 본문이 없다. content-type을 붙이면 Fastify가 빈 JSON 본문으로 보고 400을 낸다. */
async function proxy(request: Request, viewId: string, method: "PATCH" | "DELETE"): Promise<Response> {
  const token = await readAccessToken();
  if (!token) return new Response(null, { status: 401 });
  // 요청 본문은 계약으로 먼저 검사합니다. 틀린 값을 그대로 넘기면 서버 오류 문구만 돌아옵니다.
  const body = method === "PATCH" ? UpdateCareerViewConfigurationSchema.safeParse(await request.json().catch(() => null)) : null;
  if (body && !body.success) return new Response("값을 확인해 주세요", { status: 400 });
  const upstream = await fetch(`${API_BASE_URL}${API_PREFIX}/career/view-configurations/${encodeURIComponent(viewId)}`, {
    method,
    headers: { authorization: `Bearer ${token}`, accept: "application/json", "if-match": request.headers.get("if-match") ?? "", ...(method === "PATCH" ? { "content-type": "application/json" } : {}) },
    ...(body?.success ? { body: JSON.stringify(body.data) } : {}),
    cache: "no-store",
  });
  if (!upstream.ok) return new Response(null, { status: upstream.status });
  if (method === "DELETE") return new Response(null, { status: 204 });
  try { return Response.json(CareerViewResponseSchema.parse(await upstream.json())); }
  catch { return new Response(null, { status: 502 }); }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ viewId: string }> }) { return proxy(request, (await params).viewId, "PATCH"); }
export async function DELETE(request: Request, { params }: { params: Promise<{ viewId: string }> }) { return proxy(request, (await params).viewId, "DELETE"); }
