import { GENERATION_CANCELLED } from "@expresso/contracts";
import { notFound, redirect } from "next/navigation";

import { ApiError } from "@/lib/api/client";
import { brews, designSystems, entitlements } from "@/lib/api/endpoints";
import { requireSession } from "@/lib/require-session";

import { BrewFrame } from "../BrewFrame";
import { brewTitle } from "../brew-title";
import { DesignCatalog, type DesignCatalogEntry } from "./DesignCatalog";
import { Generating } from "./Generating";
import { failureNote } from "./failure-note";
import { waitReading } from "./wait-reading";
import { brewingLeftMs, waitedMs } from "./wait-timing";

/**
 * 디자인 카탈로그 화면(`?view=catalog`). 구조화 생성과 페이지 짜임새를 카탈로그에서 골라 만든다.
 *
 * 디자인은 대화의 「디자인」 카드에서 고른다. 이 주소를 `view=catalog` 없이 열면(옛 링크 · 다시 뽑기) 제작을 잇는 주소로 보낸다.
 * 진행 중인 생성은 어느 쪽으로 열든 기다림 화면이고, 끝난 생성은 06 다듬기 편집 화면으로 간다. 카탈로그 화면은 구성(레시피)이 아직이어도
 * 실행할 수 있고, 그때는 구성이 끝나는 대로 생성이 이어진다.
 */
export default async function DesignPage({
  params,
  searchParams,
}: {
  params: Promise<{ brewId: string }>;
  searchParams: Promise<{ again?: string; view?: string }>;
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

  const title = brewTitle(brew);
  const generation = brew.latestGeneration;
  const running = generation?.status === "queued" || generation?.status === "running";
  const again = query.again === "1";
  const isFreeBrew = brew.freeTitle !== null;
  // 구성(레시피) 잡. 화면 단계는 없고, AI 대화를 마치거나 만들기를 누르면 맡긴다.
  const recipeJob = brew.latestJob?.type === "recipe" ? brew.latestJob : null;
  const recipeBuilding = recipeJob?.status === "queued" || recipeJob?.status === "running";

  // 끝난 생성은 다듬기로 간다. 생성 중에 `done` 신호를 받은 `LivePreview`가 다시 그리게 하면 이 분기를 탄다.
  const finished = generation?.status === "done" ? generation.portfolioId ?? brew.portfolioId : null;
  if (finished && !again) redirect(`/edit/${finished}`);
  // 카탈로그에서 맡긴 생성은 이 주소에서 기다린다(아래). 그 밖에 `view=catalog` 없이 열면(옛 링크) 그 제작의 대화로 보낸다.
  if (!running && query.view !== "catalog") redirect(`/brew/${brewId}${again ? "?again=1" : ""}`);

  if (running) {
    const reading = await waitReading(session.accessToken, brew);
    const now = Date.now();
    return (
      <BrewFrame brewId={brewId} step="design" portfolioTitle={title} situation="생성" tinted>
        <Generating
          brewId={brewId}
          generation={generation}
          title={title ?? "포트폴리오"}
          reading={reading}
          brewingLeftMs={brewingLeftMs(generation.createdAt, now)}
          waitedMs={waitedMs(generation.createdAt, now)}
          recipePending={generation.status === "queued" && recipeBuilding}
        />
      </BrewFrame>
    );
  }

  // 목록은 카드가 그리는 값만 받는다. 문서는 고른 판 하나만 따로 불러온다.
  const [catalog, quota] = await Promise.all([
    designSystems.list(session.accessToken),
    entitlements.check(session.accessToken, "portfolio.generate"),
  ]);
  const notice: { tone: "info" | "error"; text: string } | null =
    generation?.status === "failed" && generation.failureCode === GENERATION_CANCELLED
      ? { tone: "info", text: "생성을 멈췄습니다. 크레딧은 차감하지 않았습니다. 디자인을 고르면 다시 만들 수 있습니다." }
    : generation?.status === "failed" ? { tone: "error", text: failureNote(generation.failureCode, isFreeBrew) }
    : recipeJob?.status === "failed" && !brew.recipeId ? { tone: "error", text: failureNote(recipeJob.failure?.code ?? null, isFreeBrew) }
    : null;

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
        recipeBuilding={recipeBuilding}
        notice={notice ?? (recipeBuilding ? { tone: "info", text: "구성을 만드는 중입니다. 지금 눌러도 구성이 끝나는 대로 이어서 만듭니다." } : null)}
      />
    </BrewFrame>
  );
}
