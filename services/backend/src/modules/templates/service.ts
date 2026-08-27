import { findPortfolioStyle, TemplatePreviewsSchema } from "@expresso/contracts";
import type { SqlTag } from "../../platform/mysql.js";

import type { RecipeService } from "../recipe/service.js";
import { renderTemplate } from "./render.js";

interface TemplateRow {
  id: string; code: string; name: string; plan_required: "free" | "pro";
  tone_tags: string[]; supported_sections: string[]; style: unknown; industries: string[];
}

export class TemplateService {
  readonly #sql: SqlTag;
  readonly #recipes: RecipeService;
  constructor(sql: SqlTag, recipes: RecipeService) {
    this.#sql = sql; this.#recipes = recipes;
  }

  async previews(userId: string, recipeId: string, useCompanyColors: boolean) {
    const recipe = await this.#recipes.getRecipe(userId, recipeId);
    const company = (await this.#sql<{
      tone_summary: string | null; tone_palette: Record<string, string> | null; industry: string | null;
    }[]>`
      select company.tone_summary, company.tone_palette, company.industry
      from recipe
      join brew on brew.id = recipe.brew_id and brew.user_id = recipe.user_id
      join job_analysis on job_analysis.id = brew.job_analysis_id and job_analysis.user_id = brew.user_id
      left join job_posting on job_posting.id = job_analysis.job_posting_id
      left join company on company.id = job_posting.company_id
      where recipe.id = ${recipeId} and recipe.user_id = ${userId}
    `)[0];
    const templates = await this.#sql<TemplateRow[]>`
      select id, code, name, plan_required, tone_tags, supported_sections, style, industries
      from template where is_active order by code
    `;
    const tone = company?.tone_summary?.toLocaleLowerCase("en-US") ?? "";
    // 옛 세 종은 기존 제작·포트폴리오의 참조용으로 남기고 새 목록에서는 숨긴다.
    // 아직 마이그레이션 전이면 기존 목록을 계속 보여 준다.
    const hasCatalog = templates.some(({ code }) => findPortfolioStyle(code));
    const visible = hasCatalog
      ? templates.filter(({ code }) => !["clarity", "signal", "editorial"].includes(code))
      : templates;
    const ranked = visible.map((template) => ({
      template,
      score: template.tone_tags.filter((tag) => tone.includes(tag.toLocaleLowerCase("en-US"))).length
        + (company?.industry && template.industries.includes(company.industry) ? 1 : 0),
    })).sort((left, right) => right.score - left.score
      || (findPortfolioStyle(left.template.code)?.order ?? 1_000) - (findPortfolioStyle(right.template.code)?.order ?? 1_000)
      || left.template.code.localeCompare(right.template.code));
    const recommendedId = ranked[0]?.template.id;
    const previews = ranked.map(({ template, score }) => renderTemplate({
      templateId: template.id,
      code: template.code,
      name: template.name,
      planRequired: template.plan_required,
      supportedSections: template.supported_sections,
      style: template.style,
      recommended: template.id === recommendedId,
      recommendationReason: score > 0
        ? "기업 tone/industry와 일치"
        : template.id === recommendedId ? "기본 가독성 추천" : "다른 표현 밀도 선택지",
      sections: recipe.sections.map((section) => ({
        id: section.id,
        title: section.title,
        items: section.items.map(({ pointText }) => ({ pointText })),
      })),
      ...(useCompanyColors && company?.tone_palette
        ? { companyStyle: company.tone_palette }
        : {}),
    }));
    return TemplatePreviewsSchema.parse({ recipeId, previews });
  }
}
