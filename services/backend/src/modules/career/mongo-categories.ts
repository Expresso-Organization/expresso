import { CareerCategorySchema } from "@expresso/contracts";
import { mongoCollections, type CareerCategoryDoc } from "@expresso/database";
import type { ClientSession } from "mongodb";
import type { MongoContext } from "../../platform/mongodb.js";
import { CareerError } from "./errors.js";

export function mapMongoCategory(category: CareerCategoryDoc, recordCount = 0) {
  return CareerCategorySchema.parse({ id: category._id, key: category.key, name: category.name, icon: category.icon, defaultView: category.defaultView, propertySchemaV2: category.propertySchemaV2, schemaVersion: category.schemaVersion, sortOrder: category.sortOrder, version: category.version, recordCount });
}
export async function requireCareerCategory(context: MongoContext, userId: string, categoryId: string, session?: ClientSession) {
  const category = await mongoCollections(context.db).careerCategories.findOne({ _id: categoryId, userId }, session ? { session } : {});
  if (!category) throw new CareerError(404, "career category not found");
  return category;
}
