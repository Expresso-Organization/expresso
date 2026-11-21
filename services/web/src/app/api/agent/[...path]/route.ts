import { API_PREFIX, AgentBrewOpenResponseSchema, AgentDesignDrawSchema, AgentBrewStartStateResponseSchema, AgentGoalDraftDecisionSchema, AgentPlanDecisionSchema, AgentRecordDraftDecisionSchema, AgentReplanDecisionSchema, AgentReviewFreshnessResponseSchema, UuidSchema, CreateAgentConversationSchema, SendAgentMessageSchema, AddAgentContextSchema, AgentApprovalSchema, AgentConversationResponseSchema, AgentConversationListSchema, SetAgentContextsSchema } from "@expresso/contracts";
import { API_BASE_URL } from "@/lib/api/client";
import { readAccessToken } from "@/lib/session";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** 대화 안 초안의 결정(POST conversations/:id/<종류>/:draftId)과 그 입력 계약. */
const DRAFT_DECISIONS = { "record-drafts": AgentRecordDraftDecisionSchema, "goal-drafts": AgentGoalDraftDecisionSchema, "plan-drafts": AgentPlanDecisionSchema, "replan-drafts": AgentReplanDecisionSchema } as const;
const isDraftAction = (action: string | undefined): action is keyof typeof DRAFT_DECISIONS => !!action && action in DRAFT_DECISIONS;
async function proxy(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const token = await readAccessToken(); if (!token) return Response.json({ error: { message: "로그인이 필요합니다." } }, { status: 401 });
  const { path } = await context.params;
  const action = path[2]; const isGet = request.method === "GET";
  // 경로가 넷인 것: 요건 대조 · 보완점 최신성(GET reviews/:toolId) · 초안 결정(POST <종류>/:draftId).
  const nested = path.length === 4 && UuidSchema.safeParse(path[3]).success;
  const review = isGet && action === "reviews" && nested;
  const draftDecision = !isGet && isDraftAction(action) && nested;
  // 지면 고침 되돌리기(POST page-edits/:editId/undo). 본문은 없다.
  // 저장한 기록 되돌리기(POST saved-records/:recordId/undo)도 같은 모양이다.
  const pageUndo = !isGet && (action === "page-edits" || action === "saved-records") && path.length === 5 && UuidSchema.safeParse(path[3]).success && path[4] === "undo";
  // 대화에서 시작한 포트폴리오 제작: 상태(GET brew-starts/:startId) · 제작 열기 · 다시 분석 · 분석 완료 알림(POST brew-starts/:startId/open|retry|announce). 본문은 없다.
  const brewState = isGet && action === "brew-starts" && nested;
  const brewAction = !isGet && action === "brew-starts" && path.length === 5 && UuidSchema.safeParse(path[3]).success && (path[4] === "open" || path[4] === "retry" || path[4] === "announce");
  // 대화에서 인터뷰 열기(POST brews/:brewId/interview). 본문은 없고 대화를 돌려준다.
  const brewInterview = !isGet && action === "brews" && path.length === 5 && UuidSchema.safeParse(path[3]).success && path[4] === "interview";
  // 대화에서 디자인 열기(POST brews/:brewId/design, 본문 없음) · 견본의 짝으로 첫 화면 그리기(POST brews/:brewId/design/draw).
  const brewDesign = !isGet && action === "brews" && UuidSchema.safeParse(path[3]).success && path[4] === "design" && (path.length === 5 || (path.length === 6 && path[5] === "draw"));
  const designDraw = brewDesign && path.length === 6;
  // 고른 첫 화면으로 만들기(POST brews/:brewId/generation). 본문은 없고 대화를 돌려준다.
  const brewGeneration = !isGet && action === "brews" && path.length === 5 && UuidSchema.safeParse(path[3]).success && path[4] === "generation";
  if (path[0] !== "conversations" || (path.length > 3 && !review && !draftDecision && !pageUndo && !brewState && !brewAction && !brewInterview && !brewDesign && !brewGeneration) || (path[1] && !UuidSchema.safeParse(path[1]).success)) return new Response(null, { status: 404 });
  if ((isGet && action && action !== "events" && !review && !brewState) || (!isGet && path.length === 2) || (!isGet && action && !["messages", "contexts", "context-selection", "approval", "cancel", "retry"].includes(action) && !draftDecision && !pageUndo && !brewAction && !brewInterview && !brewDesign && !brewGeneration)) return new Response(null, { status: 404 });
  let body: string | undefined = action === "cancel" || action === "retry" || pageUndo || brewAction || brewInterview || brewGeneration || (brewDesign && !designDraw) ? "{}" : undefined;
  if (!isGet) {
    const schema = designDraw ? AgentDesignDrawSchema : draftDecision && isDraftAction(action) ? DRAFT_DECISIONS[action] : action === "messages" ? SendAgentMessageSchema : action === "context-selection" ? SetAgentContextsSchema : action === "contexts" ? AddAgentContextSchema : action === "approval" ? AgentApprovalSchema : action === "cancel" || action === "retry" || pageUndo || brewAction || brewInterview || brewDesign || brewGeneration ? null : CreateAgentConversationSchema;
    if (schema) { const result = schema.safeParse(await request.json().catch(() => null)); if (!result.success) return Response.json({ error: { message: "입력 내용을 확인해 주세요." } }, { status: 400 }); body = JSON.stringify(result.data); }
  }
  // API가 내려가 있으면 fetch가 던진다. 그대로 두면 Next가 본문 없는 500을 내고, 화면은 브라우저의 JSON 해석 오류를 그대로 보인다.
  const upstream = await fetch(`${API_BASE_URL}${API_PREFIX}/agent/${path.join("/")}`, { method: request.method, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, ...(body === undefined ? {} : { body }), signal: request.signal, cache: "no-store" }).catch(() => null);
  if (!upstream) return Response.json({ error: { message: "서버에 연결하지 못했습니다. 잠시 뒤 다시 시도해 주세요." } }, { status: 502 });
  if (action === "events" && upstream.ok) return new Response(upstream.body, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", "x-accel-buffering": "no" } });
  const payload: unknown = await upstream.json().catch(() => ({ error: { message: "서버에 연결하지 못했습니다." } }));
  if (!upstream.ok) return Response.json(payload, { status: upstream.status });
  const result = (brewAction && path[4] === "open" ? AgentBrewOpenResponseSchema : brewState || (brewAction && path[4] === "retry") ? AgentBrewStartStateResponseSchema : review ? AgentReviewFreshnessResponseSchema : isGet && path.length === 1 ? AgentConversationListSchema : AgentConversationResponseSchema).safeParse(payload);
  return result.success ? Response.json(result.data, { status: upstream.status }) : Response.json({ error: { message: "응답 형식을 확인할 수 없습니다." } }, { status: 502 });
}
export const GET = proxy;
export const POST = proxy;
