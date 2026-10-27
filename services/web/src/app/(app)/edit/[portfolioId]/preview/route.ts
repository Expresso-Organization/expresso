import { ApiError } from "@/lib/api/client";
import { page } from "@/lib/api/endpoints";
import { pageDocumentResponse } from "@/lib/page-document";
import { readAccessToken } from "@/lib/session";

/**
 * 04 미리보기 — 지금 판을 배포될 문서 그대로 새 탭에 연다.
 *
 * 브라우저는 백엔드에 토큰을 붙일 수 없어 웹 서버가 세션으로 대신 받아 넘긴다.
 * 백엔드 문서 라우트 · 공개 사이트와 같은 정책(`pageDocumentPolicy`)을 붙인다 — 우리 오리진에서
 * 열려도 문서는 불투명 오리진이 되어 쿠키에 닿지 못하고, 스크립트는 장면 런타임만 돈다.
 */
export async function GET(request: Request, { params }: { params: Promise<{ portfolioId: string }> }): Promise<Response> {
  const accessToken = await readAccessToken();
  if (!accessToken) return new Response("로그인이 필요합니다", { status: 401 });
  const { portfolioId } = await params;
  try {
    const document = await page.document(accessToken, portfolioId);
    return pageDocumentResponse(document, request);
  } catch (error) {
    if (error instanceof ApiError) return new Response(error.message, { status: error.status });
    throw error;
  }
}
