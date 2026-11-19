import {
  API_PREFIX,
  DesignChatResponseSchema,
  DesignChatStateResponseSchema,
  OpenDesignChatSchema,
  RetryDesignChatSchema,
  SelectDesignSnippetSchema,
  SendDesignMessageSchema,
  UuidSchema,
} from "@expresso/contracts";

import { API_BASE_URL } from "@/lib/api/client";
import { readAccessToken } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 디자인 대화의 프록시.
 *
 * 세션 토큰은 `httpOnly` 쿠키에만 있어 브라우저의 코드가 읽지 못한다. 화면은 이 주소를 부르고, 여기서 쿠키의 토큰을
 * 붙여 백엔드로 넘긴다. 요청과 응답을 계약으로 읽어, 어긋나면 화면이 잘못 그리는 대신 여기서 멈춘다.
 */
const BODIES = {
  open: OpenDesignChatSchema,
  messages: SendDesignMessageSchema,
  retry: RetryDesignChatSchema,
  selection: SelectDesignSnippetSchema,
} as const;
const isAction = (name: string | undefined): name is keyof typeof BODIES => !!name && name in BODIES;

async function proxy(request: Request, context: { params: Promise<{ brewId: string; path?: string[] }> }) {
  const token = await readAccessToken();
  if (!token) return Response.json({ error: { message: "로그인이 필요합니다." } }, { status: 401 });
  const { brewId, path = [] } = await context.params;
  const isGet = request.method === "GET";
  const action = path[0];
  if (!UuidSchema.safeParse(brewId).success || path.length > 1 || (isGet ? path.length !== 0 : !isAction(action))) return new Response(null, { status: 404 });

  let body: string | undefined;
  if (isAction(action)) {
    const parsed = BODIES[action].safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: { message: "입력 내용을 확인해 주세요." } }, { status: 400 });
    body = JSON.stringify(parsed.data);
  }
  const since = new URL(request.url).searchParams.get("since");
  const query = isGet && since && /^\d+$/.test(since) ? `?since=${since}` : "";
  const upstream = await fetch(`${API_BASE_URL}${API_PREFIX}/brews/${brewId}/design-chat${action ? `/${action}` : ""}${query}`, {
    method: request.method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    ...(body === undefined ? {} : { body }),
    signal: request.signal,
    cache: "no-store",
  });
  const payload: unknown = await upstream.json().catch(() => ({ error: { message: "서버에 연결하지 못했습니다." } }));
  if (!upstream.ok) return Response.json(payload, { status: upstream.status });
  const result = (isGet ? DesignChatStateResponseSchema : DesignChatResponseSchema).safeParse(payload);
  return result.success ? Response.json(result.data, { status: upstream.status }) : Response.json({ error: { message: "응답 형식을 확인할 수 없습니다." } }, { status: 502 });
}

export const GET = proxy;
export const POST = proxy;
