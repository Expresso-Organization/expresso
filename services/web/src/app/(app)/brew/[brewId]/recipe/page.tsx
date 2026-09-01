import { notFound } from "next/navigation";

import { ApiError } from "@/lib/api/client";
import { brews, designSystems, recipeV2 } from "@/lib/api/endpoints";
import { requireSession } from "@/lib/require-session";

import { BrewFrame } from "../BrewFrame";
import { Waiting } from "../Waiting";
import { Workbench, type RecordCard } from "./Workbench";
import { draftRecipeAction } from "./recipe-actions";

/**
 * 02 레시피.
 *
 * 사용자가 정하는 것은 **어떤 내용이 어떤 순서로 들어갈지**다. 지면의 모양은
 * 01에서 고른 디자인 안에서 03 생성이 정한다
 * (`docs/architecture/portfolio-creation-flow-v2.md` §7).
 *
 * 첫 화면은 빈 지면이 아니라 AI가 만든 초안이다 — 사용자가 하는 일은 조립이
 * 아니라 고치기다.
 */
export default async function RecipePage({
  params,
}: {
  params: Promise<{ brewId: string }>;
}) {
  const session = await requireSession();
  const { brewId } = await params;

  let brew;
  try {
    brew = (await brews.get(session.accessToken, brewId)).data;
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) notFound();
    throw error;
  }

  const [recipe, materials] = await Promise.all([
    recipeV2.open(session.accessToken, brewId).then(({ data }) => data),
    brews.materials(session.accessToken, brewId).then(({ data }) => data),
  ]);

  // 고른 디자인의 이름. 목록은 백엔드가 한 번 지어 두고 재사용한다.
  let designName: string | null = null;
  if (recipe.designSystemRevisionId) {
    const catalog = await designSystems.list(session.accessToken);
    designName = catalog.data.items.find(
      ({ revisionId }) => revisionId === recipe.designSystemRevisionId,
    )?.name ?? null;
  }

  const title = recipe.title || brew.freeTitle || brew.posting?.title || null;
  const drafting = brew.latestJob?.type === "recipe" && brew.latestJob.status !== "succeeded";

  // 초안이 없거나 만들어지는 중이면 기다림 화면이다. 빈 지면을 주지 않는다.
  if (recipe.sections.length === 0 || drafting) {
    return (
      <BrewFrame
        brewId={brewId}
        step="recipe"
        portfolioTitle={title}
        situation={drafting ? "짜는 중" : "아직 없음"}
        flow="portfolio-v2"
        tinted
      >
        <Waiting
          title="레시피"
          note={
            materials.materials.some(({ selected }) => selected)
              ? `고른 기록 ${materials.materials.filter(({ selected }) => selected).length}건으로 무엇을 어떤 순서로 담을지 짭니다. 짜인 뒤에 직접 고칠 수 있습니다.`
              : "적어 둔 내용으로 무엇을 어떤 순서로 담을지 짭니다. 짜인 뒤에 직접 고칠 수 있습니다."
          }
          job={brew.latestJob?.type === "recipe" ? brew.latestJob : null}
          action={draftRecipeAction}
          actionLabel="AI에게 초안 맡기기"
          rejectedNote="입력을 읽지 못했습니다. 재료를 더 고르거나 제작 의도를 적은 뒤 다시 시도해 주세요."
          brewId={brewId}
        />
      </BrewFrame>
    );
  }

  const records: RecordCard[] = materials.materials.map((material) => ({
    recordId: material.recordId,
    title: material.title,
    categoryName: material.categoryName,
    categoryIcon: material.categoryIcon,
    periodFrom: material.periodFrom,
    periodTo: material.periodTo,
    reason: material.reason,
  }));

  return (
    <BrewFrame
      brewId={brewId}
      step="recipe"
      portfolioTitle={title}
      situation={designName ?? "디자인 없음"}
      flow="portfolio-v2"
      tinted
    >
      <Workbench
        brewId={brewId}
        initialRecipe={recipe}
        records={records}
        designName={designName}
        draftAction={draftRecipeAction}
      />
    </BrewFrame>
  );
}
