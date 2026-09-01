import { API_PREFIX } from "@expresso/contracts";

import { API_BASE_URL } from "@/lib/api/client";
import { readAccessToken } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * 짜이는 레시피를 브라우저까지 잇는 자리.
 *
 * **왜 웹을 한 번 거치는가.** `EventSource`는 헤더를 못 붙인다. 브라우저가
 * 백엔드에 직접 붙으려면 토큰을 주소에 실어야 하는데, 주소는 접근 로그 ·
 * 리퍼러 · 브라우저 기록에 그대로 남는다. 세션 쿠키는 httpOnly라
 * 자바스크립트가 못 읽으므로, **서버가 대신 붙어** 그 몸통만 흘려준다.
 *
 * 여기서 아무것도 모으지 않는다 — 백엔드의 몸통을 그대로 건네고, 브라우저가
 * 떠나면 `request.signal`이 위쪽까지 끊는다.
 *
 * 지면 쪽(`generation-jobs/[jobId]/page-stream`)과 같은 모양이고 같은 이유다.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> },
): Promise<Response> {
  const accessToken = await readAccessToken();
  if (!accessToken) return new Response("로그인이 필요합니다", { status: 401 });

  const { jobId } = await params;
  const upstream = await fetch(
    `${API_BASE_URL}${API_PREFIX}/brew-jobs/${encodeURIComponent(jobId)}/recipe-stream`,
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
      // 앞단이 모아 뒀다 흘리면 "실시간"이 그 자리에서 사라진다.
      "x-accel-buffering": "no",
    },
  });
}
