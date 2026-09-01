import { notFound } from "next/navigation";

import { ApiError } from "@/lib/api/client";
import { brews, designSystems, jobs, recipeV2 } from "@/lib/api/endpoints";
import { requireSession } from "@/lib/require-session";

import { BrewFrame } from "../BrewFrame";
import { Setup, type SetupRecord } from "./Setup";
import { Waiting, type ReadingCompany } from "./Waiting";
import { Workbench, type RecordCard } from "./Workbench";
import { draftRecipeAction } from "./recipe-actions";

/**
 * 02 레시피.
 *
 * 두 화면이다. 들어오면 **무엇을 겨냥하고 무엇을 쓸지 고르고**, 「레시피
 * 만들기」를 누르면 AI가 짠 문서가 나온다. 그 뒤로는 문서를 고치는 화면이다.
 *
 * 정하는 것은 어떤 내용이 어떤 순서로 들어갈지뿐이다. 지면의 모양은 01에서
 * 고른 디자인 안에서 03 생성이 정한다
 * (`docs/architecture/portfolio-creation-flow-v2.md` §7).
 */
export default async function RecipePage({
  params,
  searchParams,
}: {
  params: Promise<{ brewId: string }>;
  searchParams: Promise<{ setup?: string }>;
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
  const job = brew.latestJob?.type === "recipe" ? brew.latestJob : null;
  const drafting = job !== null && (job.status === "queued" || job.status === "running");

  if (drafting) {
    /*
     * 회사의 마크.
     *
     * 레시피가 들고 있는 공고에는 이름만 있다(`RecipeV2JobPosting`). 마크는
     * 공고 상세가 알고, 여기서만 필요하니 여기서 묻는다 — 기다리는 화면에서만
     * 그리는 것 때문에 계약을 넓히면 이 값이 쓰이지 않는 화면까지 따라다닌다.
     *
     * 못 읽어도 화면은 선다. 이름은 이미 손에 있고, `CompanyAvatar` 는 마크가
     * 없으면 이니셜을 그린다.
     */
    let company: ReadingCompany = { name: "" };
    if (recipe.jobPosting) {
      company = { name: recipe.jobPosting.companyName };
      try {
        const { data } = await jobs.posting(session.accessToken, recipe.jobPosting.jobPostingId);
        const { name, initial, avatarBackground, avatarColor, logoUrl } = data.company;
        company = { name, initial, avatarBackground, avatarColor, logoUrl };
      } catch (error) {
        if (!(error instanceof ApiError)) throw error;
      }
    }

    // 기다리는 동안 보여 줄 수 있는 것은 **모델에게 지금 가 있는 것**뿐이다.
    // 모델은 생각이 끝나야 한 글자라도 내놓는다(`Waiting`의 `Reading`).
    return (
      <BrewFrame brewId={brewId} step="recipe" portfolioTitle={title} situation="짜는 중" flow="portfolio-v2" tinted>
        <Waiting
          job={job}
          reading={{
            posting: recipe.jobPosting
              ? { title: recipe.jobPosting.title, company }
              : null,
            records: materials.materials
              .filter(({ selected }) => selected)
              .map(({ recordId, title: name, categoryIcon, reason }) => ({
                recordId, title: name, categoryIcon, reason,
              })),
          }}
        />
      </BrewFrame>
    );
  }

  if (recipe.sections.length === 0 || query.setup === "1") {
    const records: SetupRecord[] = materials.materials.map((material) => ({
      recordId: material.recordId,
      title: material.title,
      categoryName: material.categoryName,
      categoryIcon: material.categoryIcon,
      status: material.status,
      origin: material.origin,
      periodFrom: material.periodFrom,
      periodTo: material.periodTo,
      selected: material.selected,
      reason: material.reason,
    }));
    return (
      <BrewFrame
        brewId={brewId}
        step="recipe"
        portfolioTitle={title}
        situation={recipe.sections.length === 0 ? "아직 없음" : "다시 짜기"}
        flow="portfolio-v2"
        tinted
      >
        <Setup
          brewId={brewId}
          recipe={recipe}
          records={records}
          designName={designName}
          previousJobId={job?.jobId ?? null}
          failureNote={
            job?.status === "failed"
              ? job.failure?.code === "BREW_INPUT_REJECTED"
                ? "입력을 읽지 못했습니다. 기록을 더 고르거나 제작 의도를 적은 뒤 다시 시도해 주세요."
                : "레시피를 짜지 못했습니다. 잠시 뒤 다시 시도해 주세요."
              : null
          }
          draftAction={draftRecipeAction}
        />
      </BrewFrame>
    );
  }

  // 문서 화면은 고른 기록만 안다 — 근거를 더할 때 그중에서 고른다.
  const records: RecordCard[] = materials.materials
    .filter(({ selected }) => selected)
    .map((material) => ({
      recordId: material.recordId,
      title: material.title,
      categoryName: material.categoryName,
      categoryIcon: material.categoryIcon,
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
      <Workbench brewId={brewId} initialRecipe={recipe} records={records} designName={designName} />
    </BrewFrame>
  );
}
