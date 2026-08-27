import { FreeHtmlDeploymentSnapshotSchema } from "@expresso/contracts";
import { notFound, redirect } from "next/navigation";

import { ApiError } from "@/lib/api/client";
import { publishing } from "@/lib/api/endpoints";

import styles from "./page.module.css";

/**
 * 08 공개 사이트. 방문자는 편집 중인 포트폴리오가 아니라 배포 순간 고정한
 * 자유 HTML 문서를 본다. 앱 CSS와 모델 CSS가 섞이지 않도록 iframe으로 격리한다.
 */
export default async function PublicSitePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  let publication;
  try {
    publication = (await publishing.public(slug)).data;
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) {
      notFound();
    }
    throw error;
  }

  if (publication.kind === "redirect") redirect(`/site/${publication.to}`);
  const snapshot = FreeHtmlDeploymentSnapshotSchema.safeParse(publication.deployment.snapshot);
  if (!snapshot.success) notFound();

  return (
    <div className={styles.page}>
      <iframe
        className={styles.publicDocument!}
        title={snapshot.data.title}
        sandbox="allow-popups"
        srcDoc={snapshot.data.generatedPage.document}
      />
    </div>
  );
}
