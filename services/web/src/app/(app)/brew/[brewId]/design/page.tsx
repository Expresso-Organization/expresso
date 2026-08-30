import { notFound } from "next/navigation";

import { ApiError } from "@/lib/api/client";
import {
  brews,
  designSystems,
  entitlements,
  templates as templateApi,
} from "@/lib/api/endpoints";
import { requireSession } from "@/lib/require-session";

import { BrewFrame } from "../BrewFrame";
import { DesignCatalog, type DesignCatalogEntry } from "./DesignCatalog";
import { DesignPicker } from "./DesignPicker";
import { Generating } from "./Generating";

/**
 * 01 디자인 선택.
 *
 * v2는 레시피보다 먼저 디자인을 고른다. 이미 레시피가 있는 이전 제작은
 * `legacy=1`에서 기존 추출 화면을 계속 쓸 수 있고, 진행 중인 생성도 같은
 * 기다림 화면으로 돌아간다.
 */
export default async function DesignPage({
  params,
  searchParams,
}: {
  params: Promise<{ brewId: string }>;
  searchParams: Promise<{ tone?: string; again?: string; legacy?: string }>;
}) {
  const session = await requireSession();
  const { brewId } = await params;
  const query = await searchParams;

  let brew;
  try {
    brew = (await brews.get(session.accessToken, brewId)).data;
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) notFound();
    throw error;
  }

  const title = brew.freeTitle ?? brew.posting?.title ?? null;
  const generation = brew.latestGeneration;
  const running = generation?.status === "queued" || generation?.status === "running";
  const again = query.again === "1";

  if (running || (generation?.status === "done" && !again)) {
    return (
      <BrewFrame brewId={brewId} step="design" portfolioTitle={title} situation="생성" tinted>
        <Generating
          brewId={brewId}
          generation={generation}
          portfolioId={generation.portfolioId ?? brew.portfolioId}
          title={title ?? "포트폴리오"}
        />
      </BrewFrame>
    );
  }

  if (query.legacy === "1" && brew.recipeId) {
    const useCompanyColors = query.tone === "1";
    const [previews, quota] = await Promise.all([
      templateApi.previews(session.accessToken, brew.recipeId, useCompanyColors),
      entitlements.check(session.accessToken, "portfolio.generate"),
    ]);
    return (
      <BrewFrame brewId={brewId} step="design" portfolioTitle={title} situation="기존 생성" tinted>
        <DesignPicker
          brewId={brewId}
          recipeId={brew.recipeId}
          previews={previews.data.previews}
          planCode={quota.data.planCode}
          usage={quota.data.usage ?? null}
          allowed={quota.data.allowed}
          companyName={brew.posting?.companyName ?? null}
          useCompanyColors={useCompanyColors}
          madePortfolioId={brew.portfolioId}
          failureCode={generation?.status === "failed" ? generation.failureCode : null}
        />
      </BrewFrame>
    );
  }

  const catalog = await designSystems.list(session.accessToken);
  const revisions = await Promise.all(
    catalog.data.items.map((item) => designSystems.revision(session.accessToken, item.revisionId)),
  );
  const revisionById = new Map(revisions.map(({ data }) => [data.revisionId, data]));
  const entries: DesignCatalogEntry[] = catalog.data.items.flatMap((item) => {
    const revision = revisionById.get(item.revisionId);
    if (!revision) return [];
    return [{
      designSystemId: item.designSystemId,
      revisionId: item.revisionId,
      code: item.code,
      name: item.name,
      description: item.description,
      originKind: item.origin.kind,
      sourceName: item.origin.sourceName,
      sourceUrl: item.origin.sourceUrl,
      capturedAt: item.origin.capturedAt,
      attribution: item.origin.attribution,
      traits: item.traits,
      signatureMove: item.signatureMove,
      fitReasons: item.fitReasons,
      recommended: item.recommended,
      filters: {
        surface: item.surface,
        density: item.density,
        typography: item.typographyCharacter,
        contentFocus: [item.contentFocus],
        moods: item.moods,
        roles: item.roles,
      },
      designHtml: revision.designHtml,
      designMarkdown: revision.designMarkdown,
      markdownSha256: revision.markdownSha256,
      contentHash: revision.contentHash,
      spec: revision.spec,
      referenceLock: revision.referenceLock,
      legacyTemplateId: revision.legacyTemplateId,
    }];
  });

  return (
    <BrewFrame
      brewId={brewId}
      step="design"
      portfolioTitle={title}
      situation={`${entries.length}개 디자인`}
      flow="portfolio-v2"
      tinted
    >
      <DesignCatalog
        brewId={brewId}
        entries={entries}
        initialRevisionId={brew.designSelection?.designSystemRevisionId ?? null}
      />
    </BrewFrame>
  );
}
