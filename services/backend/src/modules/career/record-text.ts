import { CareerPropertyValueV2Schema, type CareerPropertyDefinitionV2 } from "@expresso/contracts";
import { mongoCollections, type CareerRecordDoc } from "@expresso/database";
import type { ClientSession, Db } from "mongodb";

/**
 * 속성 값을 사람이 읽는 값으로 편다. 선택지는 옵션 ID 대신 이름, 날짜는 시작 · 끝 문자열,
 * 관계는 대상 제목이다. 파일 · 미디어 ID처럼 읽을 글자가 없는 값은 뺀다.
 */
export function readableCareerProperties(properties: CareerRecordDoc["properties"], definitions: readonly CareerPropertyDefinitionV2[]): Record<string, unknown> {
  const readable: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(properties)) {
    const parsed = CareerPropertyValueV2Schema.safeParse(raw);
    if (!parsed.success) continue;
    const value = parsed.data;
    const definition = definitions.find((item) => item.key === key);
    const options = new Map(Array.isArray(definition?.config.options) ? (definition.config.options as { id?: unknown; name?: unknown }[]).flatMap((option) => typeof option.id === "string" && typeof option.name === "string" ? [[option.id, option.name] as const] : []) : []);
    if (value.type === "select") { if (value.value && options.has(value.value)) readable[key] = options.get(value.value); continue; }
    if (value.type === "multi_select") { readable[key] = value.value.flatMap((id) => options.has(id) ? [options.get(id)] : []); continue; }
    if (value.type === "date") { readable[key] = value.value.end ? [value.value.start, value.value.end] : value.value.start; continue; }
    if (value.type === "relation") { readable[key] = value.value.map((target) => target.title); continue; }
    if (value.type === "file" || value.type === "media") continue;
    readable[key] = value.value;
  }
  return readable;
}

/** 매칭 · 커버리지 · 자료 순위 · 인터뷰 질문이 같은 글을 읽는다. 속성은 이름으로 푼 값을 직렬화한다. */
export function careerRecordText(record: Pick<CareerRecordDoc, "title" | "bodyMd" | "properties">, definitions: readonly CareerPropertyDefinitionV2[]): string {
  return `${record.title}\n${record.bodyMd}\n${JSON.stringify(readableCareerProperties(record.properties, definitions))}`;
}

/** 한 사용자의 카테고리 정의를 한 번 읽고, 기록마다 그 카테고리 정의로 글을 만든다. */
export async function careerRecordTextReader(db: Db, userId: string, session?: ClientSession) {
  const categories = await mongoCollections(db).careerCategories.find({ userId }, session ? { session } : {}).toArray();
  const definitions = new Map(categories.map((category) => [category._id, category.propertySchemaV2]));
  return (record: Pick<CareerRecordDoc, "title" | "bodyMd" | "properties" | "categoryId">) => careerRecordText(record, definitions.get(record.categoryId) ?? []);
}
