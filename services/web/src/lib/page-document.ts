import { pageDocumentPolicy } from "@expresso/contracts";

/**
 * 완성된 지면 문서 응답입니다. 공개 지면과 편집 미리보기가 같은 헤더를 겁니다.
 *
 * 장면 런타임을 허용할 출처는 `APP_BASE_URL`에서 만듭니다. 앞단이 nginx라 요청 헤더에서 추측하지 않습니다.
 * 값이 없으면(개발) 요청 주소의 출처를 씁니다. 출처가 어긋나면 런타임이 막혀 장면 대신 대체 그림이 보입니다.
 */
export function pageDocumentResponse(document: string, request: Request, cacheControl = "no-store"): Response {
  const origin = process.env.APP_BASE_URL ? new URL(process.env.APP_BASE_URL).origin : new URL(request.url).origin;
  return new Response(document, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": pageDocumentPolicy(origin),
      "x-content-type-options": "nosniff",
      "cache-control": cacheControl,
    },
  });
}
