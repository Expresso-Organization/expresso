import type { BrewState } from "@expresso/contracts";
import { notFound, redirect } from "next/navigation";

import { ApiError } from "@/lib/api/client";
import { brews, designSystems, entitlements, jobAnalyses, recipes } from "@/lib/api/endpoints";
import { CAREER_CATEGORY_ICONS } from "@/lib/career-category-icons";
import { requireSession } from "@/lib/require-session";

import { BrewFrame } from "../BrewFrame";
import { DesignCatalog, type DesignCatalogEntry } from "./DesignCatalog";
import { Generating } from "./Generating";
import type { WaitReading } from "./GenerationWait";
import { brewingLeftMs } from "./wait-timing";

/**
 * 03 디자인 선택 — 제작 흐름의 다섯째 단계.
 *
 * 레시피를 만든 뒤 디자인 시스템을 고르고 그 디자인으로 생성을 실행한다. 진행 중인 생성은
 * 기다림 화면으로, 끝난 생성은 06 다듬기 편집 화면으로 간다. "다시 뽑기"(`again=1`)는 카탈로그를 연다.
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

  // 끝난 생성은 다듬기로 간다. 생성 중에 `done` 신호를 받은 `LivePreview`가 다시 그리게 하면 이 분기를 탄다.
  const finished = generation?.status === "done" ? generation.portfolioId ?? brew.portfolioId : null;
  if (finished && !again) redirect(`/edit/${finished}`);

  if (running) {
    const reading = await waitReading(session.accessToken, brew);
    return (
      <BrewFrame brewId={brewId} step="design" portfolioTitle={title} situation="생성" tinted>
        <Generating
          brewId={brewId}
          generation={generation}
          title={title ?? "포트폴리오"}
          reading={reading}
          brewingLeftMs={brewingLeftMs(generation.createdAt, Date.now())}
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

/**
 * 기다리는 동안 보여 줄 입력 묶음. 지면 설계가 읽는 것(공고 · 디자인 · 레시피 섹션 · 근거 기록) 가운데
 * 화면이 이미 아는 것이다.
 *
 * 공고 요건과 디자인은 따로 읽어야 해서, 못 읽으면 그 부분만 빼고 화면은 선다.
 */
async function waitReading(accessToken: string, brew: BrewState): Promise<WaitReading> {
  const revisionId = brew.designSelection?.designSystemRevisionId;
  const optional = <T,>(promise: Promise<T>): Promise<T | null> =>
    promise.catch((error: unknown) => {
      if (error instanceof ApiError) return null;
      throw error;
    });
  const [materials, recipe, catalog, analysis] = await Promise.all([
    brews.materials(accessToken, brew.brewId),
    brew.recipeId ? recipes.get(accessToken, brew.recipeId) : null,
    revisionId ? optional(designSystems.list(accessToken)) : null,
    brew.posting ? optional(jobAnalyses.get(accessToken, brew.jobAnalysisId)) : null,
  ]);
  const design = catalog?.data.items.find((item) => item.revisionId === revisionId) ?? null;
  return {
    posting: brew.posting
      ? {
          title: brew.posting.title,
          companyName: brew.posting.companyName,
          requirements: (analysis?.data.requirements ?? []).map(({ label, kind }) => ({ label, kind })),
        }
      : null,
    design: design
      ? { code: design.code, name: design.name, description: design.description, traits: design.traits, preview: design.preview }
      : null,
    sections: (recipe?.data.sections ?? []).map((section) => ({
      id: section.id,
      title: section.title,
      purpose: section.purpose,
      points: section.context.points,
    })),
    records: materials.data.materials
      .filter(({ selected }) => selected)
      .map(({ recordId, title, categoryKey, categoryName, reason }) => ({
        recordId,
        title,
        categoryIcon: CAREER_CATEGORY_ICONS[categoryKey] ?? "file-text",
        categoryName,
        reason,
      })),
  };
}
