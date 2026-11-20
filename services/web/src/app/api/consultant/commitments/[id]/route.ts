import { API_PREFIX, ConsultantCommitmentResponseSchema, UpdateCommitmentSchema, UuidSchema } from "@expresso/contracts";
import { API_BASE_URL } from "@/lib/api/client";
import { readAccessToken } from "@/lib/session";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/**
 * 약속 프록시. 약속은 대화가 아니라 사용자에게 속하므로 대화 프록시와 따로 둔다.
 * 대화의 약속 카드가 쓴다: GET으로 지금 상태를 읽고, PATCH로 날짜를 바꾸거나 약속을 거둔다.
 */
async function proxy(request: Request, context: { params: Promise<{ id: string }> }) {
  const token = await readAccessToken(); if (!token) return Response.json({ error: { message: "로그인이 필요합니다." } }, { status: 401 });
  const { id } = await context.params;
  if (!UuidSchema.safeParse(id).success) return new Response(null, { status: 404 });
  let body: string | undefined;
  if (request.method === "PATCH") {
    const result = UpdateCommitmentSchema.safeParse(await request.json().catch(() => null));
    if (!result.success) return Response.json({ error: { message: "바꿀 내용을 확인해 주세요." } }, { status: 400 });
    body = JSON.stringify(result.data);
  }
  const upstream = await fetch(`${API_BASE_URL}${API_PREFIX}/consultant/commitments/${id}`, { method: request.method, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, ...(body === undefined ? {} : { body }), signal: request.signal, cache: "no-store" });
  const payload: unknown = await upstream.json().catch(() => ({ error: { message: "서버에 연결하지 못했습니다." } }));
  if (!upstream.ok) return Response.json(payload, { status: upstream.status });
  const result = ConsultantCommitmentResponseSchema.safeParse(payload);
  return result.success ? Response.json(result.data) : Response.json({ error: { message: "응답 형식을 확인할 수 없습니다." } }, { status: 502 });
}
export const GET = proxy;
export const PATCH = proxy;
