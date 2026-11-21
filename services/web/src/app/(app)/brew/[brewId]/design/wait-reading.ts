import type { BrewState } from "@expresso/contracts";

import { ApiError } from "@/lib/api/client";
import { brews, designSystems, jobAnalyses, recipes } from "@/lib/api/endpoints";
import { CAREER_CATEGORY_ICONS } from "@/lib/career-category-icons";

import type { WaitReading } from "./GenerationWait";

/**
 * 기다리는 동안 보여 줄 입력 묶음. 지면 설계가 읽는 것(공고 · 디자인 · 레시피 섹션 · 근거 기록) 가운데
 * 화면이 이미 아는 것이다.
 *
 * 공고 요건과 디자인은 따로 읽어야 해서, 못 읽으면 그 부분만 빼고 화면은 선다.
 */
export async function waitReading(accessToken: string, brew: BrewState): Promise<WaitReading> {
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
