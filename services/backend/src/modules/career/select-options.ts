import { randomUUID } from "node:crypto";

import type { CareerPropertyValueV2 } from "@expresso/contracts";
import { mongoCollections } from "@expresso/database";

import type { MongoTransaction } from "../../platform/mongo-transaction.js";
import { CareerError } from "./errors.js";

/**
 * 이름 하나를 단일 선택 값으로 바꾼다. 카테고리에 없는 이름은 옵션으로 더한다.
 * 규칙은 `multiSelectValueByNames`와 같다 — 살아 있는 단일 선택 속성이 없으면 null이다.
 */
export async function selectValueByName(tx: MongoTransaction, userId: string, categoryId: string, key: string, name: string): Promise<Extract<CareerPropertyValueV2, { type: "select" }> | null> {
  const value = await optionIdsByNames(tx, userId, categoryId, key, "select", [name]);
  return value ? { type: "select", value: value[0] ?? null } : null;
}

/**
 * 이름 목록을 다중 선택 값으로 바꾼다. 카테고리에 없는 이름은 옵션으로 더한다.
 *
 * 그 키의 살아 있는 다중 선택 속성이 없으면 null이다 — 사용자가 지우거나 타입을 바꾼
 * 속성을 되살리지 않는다. 옵션을 더할 때는 카테고리 버전을 조건으로 건다.
 */
export async function multiSelectValueByNames(tx: MongoTransaction, userId: string, categoryId: string, key: string, names: readonly string[]): Promise<Extract<CareerPropertyValueV2, { type: "multi_select" }> | null> {
  const ids = await optionIdsByNames(tx, userId, categoryId, key, "multi_select", names);
  return ids ? { type: "multi_select", value: ids } : null;
}

/**
 * 선택지 이름의 비교 키. 표기만 다른 이름을 같은 선택지로 본다.
 *
 * AI 정리가 같은 역량을 「재시도·타임아웃 정책 설계」와 「재시도/타임아웃 정책 설계」로 따로 적어
 * 카테고리 하나의 역량 선택지가 60개 넘게 쌓였다(2026-11-13 Discord 제보). 소문자로 바꾸고 공백과
 * 구분 기호(`·・/,.()[]-_`)만 지운다. 글자는 남긴다 — 뜻이 다른 이름을 합치지 않기 위해서다.
 * 기호만 있는 이름은 빈 키가 되므로 키로 합치지 않는다.
 */
export function optionKey(name: string): string {
  return name.toLocaleLowerCase("ko-KR").replace(/[\s·・\/,.()[\]\-_]/gu, "");
}

async function optionIdsByNames(tx: MongoTransaction, userId: string, categoryId: string, key: string, type: "select" | "multi_select", names: readonly string[]): Promise<string[] | null> {
  const categories = mongoCollections(tx.db).careerCategories;
  const category = await categories.findOne({ _id: categoryId, userId }, { session: tx.session });
  const definition = category?.propertySchemaV2.find((item) => item.key === key && item.deletedAt === null);
  if (!category || definition?.type !== type) return null;
  const options = Array.isArray(definition.config.options) ? [...definition.config.options as { id: string; name: string }[]] : [];
  const ids: string[] = [];
  for (const raw of names) {
    const name = raw.trim();
    if (!name) continue;
    const key = optionKey(name);
    let option = options.find((item) => key ? optionKey(item.name) === key : item.name.trim() === name);
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
  return ids;
}
