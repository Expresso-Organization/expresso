import { findPortfolioStyle, TemplatePreviewsSchema } from "@expresso/contracts";
import { mongoCollections, type JsonObject } from "@expresso/database";
import type { MongoContext } from "../../platform/mongodb.js";
import type { RecipeApi } from "../recipe/index.js";
import type { TemplateApi } from "./index.js";
import { renderTemplate } from "./render.js";

const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

export class MongoTemplateService implements TemplateApi {
  constructor(readonly context: MongoContext, readonly recipes: RecipeApi) {}

  async previews(userId: string, recipeId: string, useCompanyColors: boolean) {
    const recipe = await this.recipes.getRecipe(userId, recipeId);
    const db = mongoCollections(this.context.db); const stored = await db.recipes.findOne({ _id: recipeId, userId });
    const brew = stored ? await db.brews.findOne({ _id: stored.brewId, userId }) : null;
    const analysis = brew ? await db.jobAnalyses.findOne({ _id: brew.jobAnalysisId, userId }) : null;
    const posting = analysis?.jobPostingId ? await db.jobPostings.findOne({ _id: analysis.jobPostingId }) : null;
    const company = posting ? await db.companies.findOne({ _id: posting.companyId }) : null;
    const templates = await db.templates.find({ isActive: true }).sort({ code: 1 }).toArray();
    const tone = company?.toneSummary?.toLocaleLowerCase("en-US") ?? "";
    const hasCatalog = templates.some(({ code }) => findPortfolioStyle(code));
    const visible = hasCatalog ? templates.filter(({ code }) => findPortfolioStyle(code) !== undefined) : templates;
    const ranked = visible.map((template) => ({ template, score: strings(template.toneTags).filter((tag) => tone.includes(tag.toLocaleLowerCase("en-US"))).length + (company?.industry && strings(template.industries).includes(company.industry) ? 1 : 0) })).sort((left, right) => right.score - left.score || (findPortfolioStyle(left.template.code)?.order ?? 1_000) - (findPortfolioStyle(right.template.code)?.order ?? 1_000) || left.template.code.localeCompare(right.template.code));
    const recommendedId = ranked[0]?.template._id;
    return TemplatePreviewsSchema.parse({ recipeId, previews: ranked.map(({ template, score }) => renderTemplate({ templateId: template._id, code: template.code, name: template.name, planRequired: template.planRequired, supportedSections: strings(template.supportedSections), style: template.style, recommended: template._id === recommendedId, recommendationReason: score > 0 ? "기업 tone/industry와 일치" : template._id === recommendedId ? "기본 가독성 추천" : "다른 표현 밀도 선택지", sections: recipe.sections.map((section) => ({ id: section.id, title: section.title, items: section.items.map(({ pointText }) => ({ pointText })) })), ...(useCompanyColors && company?.tonePalette ? { companyStyle: company.tonePalette as JsonObject } : {}) })) });
  }
}
