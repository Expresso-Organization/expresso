import { FreeHtmlDeploymentSnapshotSchema } from "@expresso/contracts";
import type { Metadata, Route } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";

import { ApiError } from "@/lib/api/client";
import { publishing } from "@/lib/api/endpoints";
import { publicSiteFromHost, publicSiteUrl } from "@/lib/public-site";
import { withSiteTracker } from "@/lib/site-tracker";

import { SiteFrame } from "./SiteFrame";
import styles from "./page.module.css";

/**
 * 발행 정보 한 번 읽기. 메타데이터와 화면이 같은 요청 안에서 같은 응답을 본다.
 * 없는 주소(404)와 잘못된 주소(400)는 `null`이다 — 둘 다 방문자에게는 없는 페이지다.
 */
const loadPublication = cache(async (slug: string) => {
  try {
    return (await publishing.public(slug)).data;
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) return null;
    throw error;
  }
});

/**
 * 공유 미리보기가 읽는 머리. 카카오톡 · 링크드인 · 슬랙은 `og:*`를, 검색엔진은
 * `<title>`과 robots 메타를 본다.
 *
 * 제목 · 설명 · 색인 여부는 배포할 때 적은 값(`seo`)이고, 제목이 없으면 포트폴리오
 * 제목을 쓴다. 설명은 적은 것이 없으면 비운다 — 지어낸 문장을 대신 넣지 않는다.
 * 주소는 요청 호스트가 아니라 공개 주소다. 주인이 앱 주소(`/site/{slug}`)로 열어도
 * 공유는 공개 주소로 하기 때문이다.
 *
 * 옛 주소와 없는 주소는 화면이 리다이렉트 · 404로 처리한다. 여기서는 기본 제목만 둔다.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const publication = await loadPublication(slug);
  if (!publication || publication.kind !== "portfolio") return { title: "Expresso" };
  const snapshot = FreeHtmlDeploymentSnapshotSchema.safeParse(publication.deployment.snapshot);
  if (!snapshot.success) return { title: "Expresso" };

  const seo = publication.deployment.seo;
  const title = typeof seo.title === "string" && seo.title.length > 0 ? seo.title : snapshot.data.title;
  const description = typeof seo.description === "string" && seo.description.length > 0 ? seo.description : undefined;
  const indexable = seo.indexable === true;
  const url = publicSiteUrl(slug);

  return {
    title,
    // null이어야 루트 레이아웃의 제품 소개 문장이 이 사이트의 설명으로 내려오지 않는다(세그먼트 메타는 얕게 합쳐진다).
    description: description ?? null,
    openGraph: {
      title,
      ...(description ? { description } : {}),
      url,
      type: "website",
    },
    robots: indexable ? { index: true, follow: true } : { index: false, follow: false },
  };
}

/**
 * 08 공개 사이트. 방문자는 편집 중인 포트폴리오가 아니라 배포 순간 고정한
 * 자유 HTML 문서를 본다. 앱 CSS와 모델 CSS가 섞이지 않도록 iframe으로 격리한다.
 *
 * `{slug}.expresso.ai.kr`의 첫 화면도 프록시를 거쳐 여기로 온다. 앱 주소의
 * `/site/{slug}`는 로그인한 주인이 자기 사이트를 보는 자리로 남는다.
 */
export default async function PublicSitePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const publication = await loadPublication(slug);
  if (!publication) notFound();

  if (publication.kind === "redirect") {
    // 옛 주소로 들어온 방문자는 새 주소로 보낸다. 공개 주소로 왔으면 공개 주소로.
    // 프록시가 다시 쓴 요청의 host는 서버 자신이다. 방문자가 연 주소는 x-forwarded-host에 남는다.
    const received = await headers();
    const onSiteHost = publicSiteFromHost(received.get("x-forwarded-host") ?? received.get("host")).site;
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
        document={withSiteTracker(snapshot.data.generatedPage.document, outline.length)}
        outline={outline.map(({ id }) => id)}
      />
    </div>
  );
}
