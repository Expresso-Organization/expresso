import { API_PREFIX, PreparationPlanResponseSchema, UpdateTaskProgressSchema, UuidSchema } from "@expresso/contracts";
import { API_BASE_URL } from "@/lib/api/client";
import { readAccessToken } from "@/lib/session";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/**
 * 준비 계획 프록시. 계획은 대화가 아니라 사용자에게 속하므로 대화 프록시와 따로 둔다.
 * 허용하는 것은 둘이다: GET plans/:planId · PATCH plans/:planId/tasks/:taskId.
 */
async function proxy(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const token = await readAccessToken(); if (!token) return Response.json({ error: { message: "로그인이 필요합니다." } }, { status: 401 });
  const { path } = await context.params;
  const read = request.method === "GET" && path.length === 1 && UuidSchema.safeParse(path[0]).success;
  const progress = request.method === "PATCH" && path.length === 3 && path[1] === "tasks" && UuidSchema.safeParse(path[0]).success && UuidSchema.safeParse(path[2]).success;
  if (!read && !progress) return new Response(null, { status: 404 });
  let body: string | undefined;
  if (progress) {
    const result = UpdateTaskProgressSchema.safeParse(await request.json().catch(() => null));
    if (!result.success) return Response.json({ error: { message: result.error.issues[0]?.message ?? "입력 내용을 확인해 주세요." } }, { status: 400 });
    body = JSON.stringify(result.data);
  }
  const upstream = await fetch(`${API_BASE_URL}${API_PREFIX}/agent/plans/${path.join("/")}`, { method: request.method, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, ...(body === undefined ? {} : { body }), signal: request.signal, cache: "no-store" });
  const payload: unknown = await upstream.json().catch(() => ({ error: { message: "서버에 연결하지 못했습니다." } }));
  if (!upstream.ok) return Response.json(payload, { status: upstream.status });
  const result = PreparationPlanResponseSchema.safeParse(payload);
  return result.success ? Response.json(result.data) : Response.json({ error: { message: "응답 형식을 확인할 수 없습니다." } }, { status: 502 });
}
export const GET = proxy;
export const PATCH = proxy;
