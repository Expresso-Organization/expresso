import { FreeHtmlDeploymentSnapshotSchema } from "@expresso/contracts";

import { ApiError } from "@/lib/api/client";
import { publishing } from "@/lib/api/endpoints";
import { pageDocumentResponse } from "@/lib/page-document";
import { publicSiteFromHost, publicSiteUrl } from "@/lib/public-site";
import { SITE_TRACKER_SCRIPT_SOURCE, withSiteTracker } from "@/lib/site-tracker";

/**
 * 08 공개 사이트의 문서 한 장입니다. 공개 사이트 화면이 iframe 주소로 엽니다.
 *
 * 배포 순간 고정한 문서에 추적 스크립트를 붙여 내보냅니다. 스크립트 정책은 문서 안이 아니라 응답 헤더 하나로 겁니다.
 * 그래야 정책이 생기기 전에 배포한 스냅샷도 같은 정책(불투명 출처 · 장면 런타임과 추적 스크립트만 허용)으로 열립니다.
 *
 * `{slug}.expresso.ai.kr/document`도 프록시를 거쳐 여기로 옵니다. 그 주소에서는 장면 런타임도 그 주소에서 받습니다.
 * 프록시가 다시 쓴 요청의 host는 서버 자신이라 방문자가 연 주소는 x-forwarded-host에서 읽습니다.
 */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }): Promise<Response> {
  const { slug } = await params;
  const onSiteHost = publicSiteFromHost(request.headers.get("x-forwarded-host") ?? request.headers.get("host")).site;
  let publication;
  try {
    publication = (await publishing.public(slug)).data;
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) return new Response("없는 사이트입니다", { status: 404 });
    throw error;
  }
  if (publication.kind === "redirect") {
    const to = onSiteHost ? `${publicSiteUrl(publication.to)}/document` : `/site/${encodeURIComponent(publication.to)}/document`;
    return new Response(null, { status: 308, headers: { location: to } });
  }
  const snapshot = FreeHtmlDeploymentSnapshotSchema.safeParse(publication.deployment.snapshot);
  if (!snapshot.success) return new Response("없는 사이트입니다", { status: 404 });
  const document = withSiteTracker(snapshot.data.generatedPage.document, snapshot.data.outline?.length ?? 0);
  return pageDocumentResponse(document, request, {
    ...(onSiteHost ? { origin: publicSiteUrl(slug) } : {}),
    scripts: [SITE_TRACKER_SCRIPT_SOURCE],
  });
}
