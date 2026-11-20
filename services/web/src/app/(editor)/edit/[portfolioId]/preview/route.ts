import { ApiError } from "@/lib/api/client";
import { page } from "@/lib/api/endpoints";
import { readAccessToken } from "@/lib/session";

/**
 * 04 미리보기 — 지금 판을 배포될 문서 그대로 새 탭에 연다.
 *
 * 브라우저는 백엔드에 토큰을 붙일 수 없어 웹 서버가 세션으로 대신 받아 넘긴다.
 * 백엔드 문서 라우트와 같은 `sandbox` 정책을 그대로 붙인다 — 우리 오리진에서
 * 열려도 문서는 불투명 오리진이 되어 쿠키와 스크립트에 닿지 못한다.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ portfolioId: string }> }): Promise<Response> {
  const accessToken = await readAccessToken();
  if (!accessToken) return new Response("로그인이 필요합니다", { status: 401 });
  const { portfolioId } = await params;
  try {
    const document = await page.document(accessToken, portfolioId);
    return new Response(document, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "content-security-policy": "sandbox allow-popups; script-src 'none'; form-action 'none'",
        "x-content-type-options": "nosniff",
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof ApiError) return new Response(error.message, { status: error.status });
    throw error;
  }
}
