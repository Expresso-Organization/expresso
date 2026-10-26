import { notFound } from "next/navigation";

import { ApiError } from "@/lib/api/client";
import { brews, designSystems, entitlements } from "@/lib/api/endpoints";
import { requireSession } from "@/lib/require-session";

import { BrewFrame } from "../BrewFrame";
import { DesignCatalog, type DesignCatalogEntry } from "./DesignCatalog";
import { Generating } from "./Generating";

/**
 * 03 디자인 선택 — 제작 흐름의 다섯째 단계.
 *
 * 레시피를 만든 뒤 디자인 시스템을 고르고 그 디자인으로 생성을 실행한다. 진행 중이거나
 * 끝난 생성은 같은 기다림 화면으로 돌아가고, "다시 뽑기"(`again=1`)는 카탈로그를 연다.
 */
export default async function DesignPage({
  params,
  searchParams,
}: {
  params: Promise<{ brewId: string }>;
  searchParams: Promise<{ again?: string }>;
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

  // 목록은 카드가 그리는 값만 받는다. 문서는 고른 판 하나만 따로 불러온다.
  const [catalog, quota] = await Promise.all([
    designSystems.list(session.accessToken),
    entitlements.check(session.accessToken, "portfolio.generate"),
  ]);
  const entries: DesignCatalogEntry[] = catalog.data.items.map((item) => ({
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
      preview: item.preview,
      legacyTemplateId: item.legacyTemplateId,
  }));

  return (
    <BrewFrame
      brewId={brewId}
      step="design"
      portfolioTitle={title}
      situation={`${entries.length}개 디자인`}
      tinted
    >
      <DesignCatalog
        brewId={brewId}
        entries={entries}
        initialRevisionId={brew.designSelection?.designSystemRevisionId ?? null}
        recipeId={brew.recipeId}
        generationAllowed={quota.data.allowed}
        failureCode={generation?.status === "failed" ? generation.failureCode : null}
      />
    </BrewFrame>
  );
}
