import { CareerCategorySchema, CareerViewSchema } from "@expresso/contracts";
import { mongoCollections, type CareerCategoryDoc, type CareerViewDoc } from "@expresso/database";
import type { ClientSession } from "mongodb";
import type { MongoContext } from "../../platform/mongodb.js";
import { CareerError } from "./errors.js";

export function mapMongoCategory(category: CareerCategoryDoc, recordCount = 0) {
  return CareerCategorySchema.parse({ id: category._id, key: category.key, name: category.name, icon: category.icon, defaultView: category.defaultView, isSystem: category.isSystem, propertySchema: category.propertySchema, sortOrder: category.sortOrder, version: category.version, recordCount });
}
export function mapMongoView(view: CareerViewDoc) {
  return CareerViewSchema.parse({ id: view._id, categoryId: view.categoryId, name: view.name, viewType: view.viewType, filters: view.filters, sorts: view.sorts, visibleProperties: view.visibleProperties, sortOrder: view.sortOrder });
}
export async function requireCareerCategory(context: MongoContext, userId: string, categoryId: string, session?: ClientSession) {
  const category = await mongoCollections(context.db).careerCategories.findOne({ _id: categoryId, $or: [{ userId: null }, { userId }] }, session ? { session } : {});
  if (!category) throw new CareerError(404, "career category not found");
  return category;
}
