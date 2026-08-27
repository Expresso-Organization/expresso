import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Icon } from "@/components/ui/Icon";
import { ApiError } from "@/lib/api/client";
import { brews, entitlements, templates as templateApi } from "@/lib/api/endpoints";
import { requireSession } from "@/lib/require-session";

import { BrewFrame } from "../BrewFrame";
import { DesignPicker } from "./DesignPicker";
import { Generating } from "./Generating";
import styles from "./page.module.css";

/**
 * 03 디자인 고르기 · 추출.
 *
 * 여기가 위저드의 **출구**다. 지금까지 이 화면은 템플릿 12종을 코드에 적어 두고
 * "추출하기"에 핸들러가 없었다 — 고를 것도 가짜였고 눌러도 아무 일이 없었다.
 *
 * 이제 후보는 `GET /recipes/:id/template-previews`가 낸다. 미리보기는 **이
 * 레시피의 실제 섹션**으로 그리고, 순서는 기업 톤·업종과 겹치는 순이다.
 * 추출은 `POST /generation-jobs`다.
 */
export default async function DesignPage({
  params,
  searchParams,
}: {
  params: Promise<{ brewId: string }>;
  searchParams: Promise<{ tone?: string; again?: string }>;
}) {
  const session = await requireSession();
  const { brewId } = await params;
  const query = await searchParams;
  const useCompanyColors = query.tone === "1";

  let brew;
  try {
    brew = (await brews.get(session.accessToken, brewId)).data;
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) notFound();
    throw error;
  }

  const title = brew.freeTitle ?? brew.posting?.title ?? null;

  // 레시피 없이는 뽑을 것이 없다. 03에 직접 들어온 경우다.
  if (!brew.recipeId) {
    return (
      <BrewFrame brewId={brewId} step="design" portfolioTitle={title} situation="아직 없음" tinted>
        <div className={styles.gate}>
          <div className={styles.gateCard}>
            <Icon name="list-checks" size={22} color="var(--ex-espresso)" />
            <h1 className={styles.gateTitle}>먼저 레시피를 짭니다</h1>
            <p className={styles.gateNote}>
              디자인은 레시피의 섹션을 채워 보여줍니다. 채울 것이 정해지지 않으면
              고른 디자인이 무엇을 보여줄지 알 수 없습니다.
            </p>
            <Link href={`/brew/${brewId}/outline` as Route} className={styles.gateAction}>
              레시피로 가기
            </Link>
          </div>
        </div>
      </BrewFrame>
    );
  }

  const generation = brew.latestGeneration;
  const running = generation?.status === "queued" || generation?.status === "running";
  // 다 뽑힌 제작으로 돌아오면 만든 것을 여는 게 먼저다. 다시 뽑는 길은 그 카드가 연다.
  const again = query.again === "1";

  if (running || (generation?.status === "done" && !again)) {
    return (
      <BrewFrame brewId={brewId} step="design" portfolioTitle={title} situation="추출" tinted>
        <Generating
          brewId={brewId}
          generation={generation}
          portfolioId={generation.portfolioId ?? brew.portfolioId}
          title={title ?? "포트폴리오"}
        />
      </BrewFrame>
    );
  }

  const [previews, quota] = await Promise.all([
    templateApi.previews(session.accessToken, brew.recipeId, useCompanyColors),
    entitlements.check(session.accessToken, "portfolio.generate"),
  ]);

  return (
    <BrewFrame brewId={brewId} step="design" portfolioTitle={title} situation="예상 3분" tinted>
      <DesignPicker
        brewId={brewId}
        recipeId={brew.recipeId}
        previews={previews.data.previews}
        planCode={quota.data.planCode}
        usage={quota.data.usage ?? null}
        allowed={quota.data.allowed}
        companyName={brew.posting?.companyName ?? null}
        useCompanyColors={useCompanyColors}
        /** 다시 뽑는 경우다. 지난번에 만든 것이 있다는 사실을 감추지 않는다. */
        madePortfolioId={brew.portfolioId}
        failureCode={generation?.status === "failed" ? generation.failureCode : null}
      />
    </BrewFrame>
  );
}
