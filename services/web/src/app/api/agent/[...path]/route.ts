import { API_PREFIX, AgentReviewFreshnessResponseSchema, UuidSchema, CreateAgentConversationSchema, SendAgentMessageSchema, AddAgentContextSchema, AgentApprovalSchema, AgentConversationResponseSchema, AgentConversationListSchema, SetAgentContextsSchema } from "@expresso/contracts";
import { API_BASE_URL } from "@/lib/api/client";
import { readAccessToken } from "@/lib/session";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function proxy(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const token = await readAccessToken(); if (!token) return Response.json({ error: { message: "로그인이 필요합니다." } }, { status: 401 });
  const { path } = await context.params;
  const action = path[2]; const isGet = request.method === "GET";
  // 요건 대조의 최신성만 경로가 넷이다: conversations/:id/reviews/:toolId.
  const review = isGet && action === "reviews" && path.length === 4 && UuidSchema.safeParse(path[3]).success;
  if (path[0] !== "conversations" || (path.length > 3 && !review) || (path[1] && !UuidSchema.safeParse(path[1]).success)) return new Response(null, { status: 404 });
  if ((isGet && action && action !== "events" && !review) || (!isGet && path.length === 2) || (!isGet && action && !["messages", "contexts", "context-selection", "approval", "cancel", "retry"].includes(action))) return new Response(null, { status: 404 });
  let body: string | undefined = action === "cancel" || action === "retry" ? "{}" : undefined;
  if (!isGet) {
    const schema = action === "messages" ? SendAgentMessageSchema : action === "context-selection" ? SetAgentContextsSchema : action === "contexts" ? AddAgentContextSchema : action === "approval" ? AgentApprovalSchema : action === "cancel" || action === "retry" ? null : CreateAgentConversationSchema;
    if (schema) { const result = schema.safeParse(await request.json().catch(() => null)); if (!result.success) return Response.json({ error: { message: "입력 내용을 확인해 주세요." } }, { status: 400 }); body = JSON.stringify(result.data); }
  }
  const upstream = await fetch(`${API_BASE_URL}${API_PREFIX}/agent/${path.join("/")}`, { method: request.method, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, ...(body === undefined ? {} : { body }), signal: request.signal, cache: "no-store" });
  if (action === "events" && upstream.ok) return new Response(upstream.body, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", "x-accel-buffering": "no" } });
  const payload: unknown = await upstream.json().catch(() => ({ error: { message: "서버에 연결하지 못했습니다." } }));
  if (!upstream.ok) return Response.json(payload, { status: upstream.status });
  const result = (review ? AgentReviewFreshnessResponseSchema : isGet && path.length === 1 ? AgentConversationListSchema : AgentConversationResponseSchema).safeParse(payload);
  return result.success ? Response.json(result.data, { status: upstream.status }) : Response.json({ error: { message: "응답 형식을 확인할 수 없습니다." } }, { status: 502 });
}
export const GET = proxy;
export const POST = proxy;
