import { API_PREFIX } from "@expresso/contracts";

import { API_BASE_URL } from "@/lib/api/client";
import { readAccessToken } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * 잡 상태가 바뀌는 순간을 브라우저까지 잇는 자리.
 *
 * `page-stream`과 같은 사정으로 웹을 한 번 거친다 — `EventSource`는 헤더를 못 붙이고, 세션 쿠키는
 * httpOnly라 서버가 대신 붙어 몸통만 흘려준다. 브라우저가 떠나면 `request.signal`이 위쪽까지 끊는다.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> },
): Promise<Response> {
  const accessToken = await readAccessToken();
  if (!accessToken) return new Response("로그인이 필요합니다", { status: 401 });

  const { jobId } = await params;
  const upstream = await fetch(
    `${API_BASE_URL}${API_PREFIX}/brew-jobs/${encodeURIComponent(jobId)}/events`,
    {
      headers: { authorization: `Bearer ${accessToken}`, accept: "text/event-stream" },
      signal: request.signal,
      cache: "no-store",
    },
  );

  if (!upstream.ok || !upstream.body) {
    return new Response(null, { status: upstream.status === 200 ? 502 : upstream.status });
  }

  return new Response(upstream.body, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
