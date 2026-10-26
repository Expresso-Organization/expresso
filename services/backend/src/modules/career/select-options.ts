import { randomUUID } from "node:crypto";

import type { CareerPropertyValueV2 } from "@expresso/contracts";
import { mongoCollections } from "@expresso/database";

import type { MongoTransaction } from "../../platform/mongo-transaction.js";
import { CareerError } from "./errors.js";

/**
 * 이름 목록을 다중 선택 값으로 바꾼다. 카테고리에 없는 이름은 옵션으로 더한다.
 *
 * 그 키의 살아 있는 다중 선택 속성이 없으면 null이다 — 사용자가 지우거나 타입을 바꾼
 * 속성을 되살리지 않는다. 옵션을 더할 때는 카테고리 버전을 조건으로 건다.
 */
export async function multiSelectValueByNames(tx: MongoTransaction, userId: string, categoryId: string, key: string, names: readonly string[]): Promise<Extract<CareerPropertyValueV2, { type: "multi_select" }> | null> {
  const categories = mongoCollections(tx.db).careerCategories;
  const category = await categories.findOne({ _id: categoryId, userId }, { session: tx.session });
  const definition = category?.propertySchemaV2.find((item) => item.key === key && item.deletedAt === null);
  if (!category || definition?.type !== "multi_select") return null;
  const options = Array.isArray(definition.config.options) ? [...definition.config.options as { id: string; name: string }[]] : [];
  const ids: string[] = [];
  for (const raw of names) {
    const name = raw.trim();
    if (!name) continue;
    let option = options.find((item) => item.name.trim().toLocaleLowerCase("ko-KR") === name.toLocaleLowerCase("ko-KR"));
    if (!option) { option = { id: randomUUID(), name }; options.push(option); }
    if (!ids.includes(option.id)) ids.push(option.id);
  }
  if (options.length !== (definition.config.options as unknown[] | undefined ?? []).length) {
    const next = category.propertySchemaV2.map((item) => item.id === definition.id ? { ...item, config: { ...item.config, options }, version: item.version + 1 } : item);
    const updated = await categories.updateOne(
      { _id: categoryId, userId, version: category.version },
      { $set: { propertySchemaV2: next, schemaVersion: (category.schemaVersion ?? category.version) + 1, updatedAt: new Date() }, $inc: { version: 1 } },
      { session: tx.session },
    );
    if (updated.modifiedCount !== 1) throw new CareerError(409, "category version is stale");
  }
  return { type: "multi_select", value: ids };
}
