import { FreeHtmlDeploymentSnapshotSchema } from "@expresso/contracts";

import { ApiError } from "@/lib/api/client";
import { publishing } from "@/lib/api/endpoints";
import { pageDocumentResponse } from "@/lib/page-document";

/**
 * 08 공개 사이트의 문서 한 장입니다. 공개 사이트 화면이 iframe 주소로 엽니다.
 *
 * 배포 순간 고정한 문서를 그대로 내보내고, 스크립트 정책은 문서 안이 아니라 응답 헤더로 겁니다. 그래야 정책이 생기기
 * 전에 배포한 스냅샷도 같은 정책(불투명 출처 · 장면 런타임만 허용)으로 열립니다.
 */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }): Promise<Response> {
  const { slug } = await params;
  let publication;
  try {
    publication = (await publishing.public(slug)).data;
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) return new Response("없는 사이트입니다", { status: 404 });
    throw error;
  }
  if (publication.kind === "redirect") return Response.redirect(new URL(`/site/${encodeURIComponent(publication.to)}/document`, request.url), 308);
  const snapshot = FreeHtmlDeploymentSnapshotSchema.safeParse(publication.deployment.snapshot);
  if (!snapshot.success) return new Response("없는 사이트입니다", { status: 404 });
  return pageDocumentResponse(snapshot.data.generatedPage.document, request);
}
