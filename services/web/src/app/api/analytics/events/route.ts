import { API_PREFIX, AnalyticsEventSchema } from "@expresso/contracts";

import { API_BASE_URL } from "@/lib/api/client";
import { readAccessToken } from "@/lib/session";

/**
 * 공개 사이트의 방문 기록을 백엔드로 넘긴다.
 *
 * 공개 사이트와 같은 호스트에서 받으므로 브라우저가 출처를 넘나들지 않는다. 앱 주소에서
 * 로그인한 주인이 자기 사이트를 보면 세션 쿠키가 함께 오고, 그 토큰을 붙여 넘기면
 * 백엔드가 주인의 방문으로 따로 둔다. 토큰은 서버에서만 다룬다.
 */
export async function POST(request: Request) {
  const body = AnalyticsEventSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return new Response(null, { status: 400 });
  const token = await readAccessToken();
  const upstream = await fetch(`${API_BASE_URL}${API_PREFIX}/analytics/events`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body.data),
    cache: "no-store",
  }).catch(() => null);
  return new Response(null, { status: upstream?.status ?? 502 });
}
