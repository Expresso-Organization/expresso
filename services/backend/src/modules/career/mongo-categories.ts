import { CareerCategorySchema } from "@expresso/contracts";
import { CAREER_CATEGORY_TEMPLATES, mongoCollections, type CareerCategoryDoc } from "@expresso/database";
import type { ClientSession } from "mongodb";
import type { MongoContext } from "../../platform/mongodb.js";
import { CareerError } from "./errors.js";

const BUILT_IN_KEYS: ReadonlySet<string> = new Set(CAREER_CATEGORY_TEMPLATES.map((template) => template.key));

/** 가입 때 복사한 기본 7종인가. 인터뷰 · 경력 기간 계산이 키로 찾으므로 삭제하지 않습니다. */
export function isBuiltInCareerCategory(category: Pick<CareerCategoryDoc, "key">): boolean {
  return BUILT_IN_KEYS.has(category.key);
}

export function mapMongoCategory(category: CareerCategoryDoc, recordCount = 0) {
  return CareerCategorySchema.parse({ id: category._id, key: category.key, name: category.name, icon: category.icon, defaultView: category.defaultView, propertySchemaV2: category.propertySchemaV2, schemaVersion: category.schemaVersion, sortOrder: category.sortOrder, version: category.version, recordCount, archivedAt: category.archivedAt?.toISOString() ?? null, builtIn: isBuiltInCareerCategory(category) });
}
export async function requireCareerCategory(context: MongoContext, userId: string, categoryId: string, session?: ClientSession) {
  const category = await mongoCollections(context.db).careerCategories.findOne({ _id: categoryId, userId }, session ? { session } : {});
  if (!category) throw new CareerError(404, "career category not found");
  return category;
}
