import { FreeHtmlDeploymentSnapshotSchema } from "@expresso/contracts";
import type { Route } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { ApiError } from "@/lib/api/client";
import { publishing } from "@/lib/api/endpoints";
import { publicSiteFromHost, publicSiteUrl } from "@/lib/public-site";

import { SiteFrame } from "./SiteFrame";
import styles from "./page.module.css";

/**
 * 08 공개 사이트. 방문자는 편집 중인 포트폴리오가 아니라 배포 순간 고정한
 * 자유 HTML 문서를 본다. 앱 CSS와 모델 CSS가 섞이지 않도록 iframe으로 격리한다.
 *
 * `{slug}.expresso.ai.kr`의 첫 화면도 프록시를 거쳐 여기로 온다. 앱 주소의
 * `/site/{slug}`는 로그인한 주인이 자기 사이트를 보는 자리로 남는다.
 *
 * 문서는 iframe 주소로 연다 — 공개 주소에서는 `/document`, 앱 주소에서는 `/site/{slug}/document`.
 * 그 응답 헤더가 스크립트 정책을 건다(장면 런타임과 추적 스크립트만 허용).
 */
export default async function PublicSitePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  // 프록시가 다시 쓴 요청의 host는 서버 자신이다. 방문자가 연 주소는 x-forwarded-host에 남는다.
  const received = await headers();
  const onSiteHost = publicSiteFromHost(received.get("x-forwarded-host") ?? received.get("host")).site;
  let publication;
  try {
    publication = (await publishing.public(slug)).data;
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) {
      notFound();
    }
    throw error;
  }

  if (publication.kind === "redirect") {
    // 옛 주소로 들어온 방문자는 새 주소로 보낸다. 공개 주소로 왔으면 공개 주소로.
    redirect(onSiteHost ? publicSiteUrl(publication.to) as Route : `/site/${publication.to}` as Route);
  }
  const snapshot = FreeHtmlDeploymentSnapshotSchema.safeParse(publication.deployment.snapshot);
  if (!snapshot.success) notFound();
  const outline = snapshot.data.outline ?? [];

  return (
    <div className={styles.page}>
      <SiteFrame
        slug={slug}
        title={snapshot.data.title}
        src={onSiteHost ? "/document" : `/site/${encodeURIComponent(slug)}/document`}
        outline={outline.map(({ id }) => id)}
      />
    </div>
  );
}
