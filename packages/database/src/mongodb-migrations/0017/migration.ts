import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { CareerPropertyValueV2Schema } from "@expresso/contracts";
import type { ClientSession, Db, Document } from "mongodb";
import type { MongoMigrationStep } from "../../mongo-migrations.js";

/**
 * 공용 기본 카테고리 7종을 사용자마다 복사하고 v1 속성 정의 · 태그 값을 v2로 옮긴다.
 *
 * - 기본 카테고리는 `templates.json`(이 마이그레이션 시점의 고정본)에서 만든다.
 * - 공용 카테고리에서 온 속성은 원래 속성 ID를 유지한다. 보기 · 관계 · 계산 속성 설정이
 *   속성 ID를 가리키므로, 바꾸는 것은 카테고리 ID뿐이다.
 * - 템플릿에 없는 옛 속성은 그 사용자 기록(휴지통 포함)에 값이 있을 때만 남긴다.
 * - 사용자 한 명의 이관은 트랜잭션 하나다. 결정적 카테고리 ID가 이미 있으면 그 사용자를 건너뛴다.
 */

interface TemplateProperty { key: string; name: string; type: string; options?: string[]; targetKey?: string }
interface Template { key: string; name: string; icon: string; defaultView: string; properties: TemplateProperty[] }
interface Definition { id: string; key: string; name: string; type: string; required: boolean; system: boolean; config: Document; order: number; version: number; deletedAt: string | null }

const LEGACY_TYPES: Record<string, string> = { text: "text", number: "number", date: "date", tags: "multi_select", boolean: "checkbox" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const DAY = /^\d{4}-(0[1-9]|1[0-2])-\d{2}$/;

function stableId(name: string): string {
  const bytes = createHash("sha1").update(Buffer.from("6ba7b8109dad11d180b400c04fd430c8", "hex")).update(name).digest();
  bytes[6] = (bytes[6]! & 15) | 80; bytes[8] = (bytes[8]! & 63) | 128;
  const hex = bytes.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
const categoryIdFor = (userId: string, key: string) => stableId(`${userId}:category:${key}`);
const propertyIdFor = (categoryId: string, key: string) => stableId(`${categoryId}:${key}`);
const optionIdFor = (propertyId: string, name: string) => stableId(`${propertyId}:option:${name}`);

/** v1 `propertySchema`를 v2 정의로 편다. 0006이 붙인 속성 ID가 없으면 같은 식으로 만든다. */
function legacyDefinitions(category: Document): Definition[] {
  return Object.entries((category.propertySchema ?? {}) as Record<string, Document>).map(([key, property], order) => ({
    id: typeof property.id === "string" ? property.id : propertyIdFor(String(category._id), key),
    key, name: String(property.label), type: LEGACY_TYPES[String(property.type)] ?? "text",
    required: property.required === true, system: property.system === true, config: {}, order, version: 1, deletedAt: null,
  }));
}

const hasValue = (value: unknown) => value !== undefined && value !== null && value !== "" && !(Array.isArray(value) && value.length === 0);

/** 카테고리 ID 문자열을 키와 값 어디에 있든 바꾼다. 보기의 열 너비는 제목 열을 카테고리 ID로 저장한다. */
function replaceIds<T>(value: T, map: ReadonlyMap<string, string>): T {
  if (typeof value === "string") return (map.get(value) ?? value) as T;
  if (Array.isArray(value)) return value.map((item) => replaceIds(item, map)) as T;
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [map.get(key) ?? key, replaceIds(item, map)])) as T;
  }
  return value;
}

type Converted = { value: Document } | { drop: true } | { unmapped: true };

/** 저장된 원값 하나를 정의 타입의 v2 값으로 바꾼다. 선택지 이름은 `option`이 ID로 바꾼다. */
function convertValue(definition: Definition, raw: unknown, option: (name: string) => string | null): Converted {
  const typed = CareerPropertyValueV2Schema.safeParse(raw);
  if (typed.success) return typed.data.type === definition.type ? { value: typed.data } : { unmapped: true };
  if (!hasValue(raw)) return { drop: true };
  const type = definition.type;
  if (["text", "title", "url", "email", "phone"].includes(type)) {
    if (typeof raw === "string") return { value: { type, value: raw } };
    if (typeof raw === "number" || typeof raw === "boolean") return { value: { type, value: String(raw) } };
    if (Array.isArray(raw) && raw.every((item) => typeof item === "string")) return { value: { type, value: raw.join(", ") } };
    return { unmapped: true };
  }
  if (type === "number") {
    if (typeof raw === "number" && Number.isFinite(raw)) return { value: { type, value: raw } };
    if (typeof raw === "string" && raw.trim() !== "" && Number.isFinite(Number(raw))) return { value: { type, value: Number(raw) } };
    return { unmapped: true };
  }
  if (type === "checkbox") return typeof raw === "boolean" ? { value: { type, value: raw } } : { unmapped: true };
  if (type === "date") {
    if (typeof raw === "string" && MONTH.test(raw)) return { value: { type, value: { start: `${raw}-01`, end: null, timezone: null } } };
    if (typeof raw === "string" && DAY.test(raw)) return { value: { type, value: { start: raw, end: null, timezone: null } } };
    return { unmapped: true };
  }
  if (type === "select" || type === "multi_select") {
    const names = (Array.isArray(raw) ? raw : [raw]).filter((item) => typeof item === "string" && item.trim() !== "") as string[];
    if (names.length !== (Array.isArray(raw) ? raw.length : 1)) return { unmapped: true };
    const ids = [...new Set(names.map((name) => option(name.trim())))].filter((id): id is string => id !== null);
    if (type === "select") return ids.length === 1 ? { value: { type, value: ids[0] } } : { unmapped: true };
    return { value: { type, value: ids } };
  }
  return { unmapped: true };
}

interface RecordChange { properties: Document; unmapped: Document; changed: boolean }

/**
 * 한 카테고리의 기록 값을 정의대로 바꾸고, 선택 속성에는 값에 나온 이름을 옵션으로 더한다.
 * 이미 옵션 ID인 값은 그대로 둔다.
 */
function convertCategory(definitions: Definition[], records: Document[], changes: Map<string, RecordChange>, counters: { unmapped: number }) {
  for (const definition of definitions) {
    if (definition.type !== "select" && definition.type !== "multi_select") continue;
    const options = Array.isArray(definition.config.options) ? [...definition.config.options as Document[]] : [];
    definition.config = { ...definition.config, options };
  }
  for (const record of [...records].sort((left, right) => String(left._id).localeCompare(String(right._id)))) {
    const change = changes.get(String(record._id))!;
    for (const definition of definitions) {
      if (!Object.hasOwn(change.properties, definition.key)) continue;
      const options = definition.config.options as Document[] | undefined;
      const option = (name: string) => {
        if (!options) return null;
        const existing = options.find((item) => item.id === name || item.name === name);
        if (existing) return String(existing.id);
        if (UUID.test(name)) return null;
        const created = { id: optionIdFor(definition.id, name), name };
        options.push(created);
        return created.id;
      };
      const raw = change.properties[definition.key];
      const converted = convertValue(definition, raw, option);
      if ("value" in converted) {
        const parsed = CareerPropertyValueV2Schema.parse(converted.value);
        if (JSON.stringify(parsed) !== JSON.stringify(raw)) { change.properties[definition.key] = parsed; change.changed = true; }
      } else {
        delete change.properties[definition.key]; change.changed = true;
        if ("unmapped" in converted) { change.unmapped[definition.id] = raw; counters.unmapped += 1; }
      }
    }
    // 정의가 없는 키는 저장 검증을 막는다. 값이 있으면 키 이름 아래 보존한다.
    for (const [key, raw] of Object.entries(change.properties)) {
      if (definitions.some((definition) => definition.key === key && definition.deletedAt === null)) continue;
      delete change.properties[key]; change.changed = true;
      if (hasValue(raw)) { change.unmapped[key] = raw; counters.unmapped += 1; }
    }
  }
}

async function migrateUser(db: Db, session: ClientSession, userId: string, templates: Template[], shared: Document[], counters: { users: number; unmapped: number }) {
  const categories = db.collection("career_categories");
  if (await categories.findOne({ _id: categoryIdFor(userId, templates[0]!.key) as never }, { session })) return;
  const now = new Date();
  const owned = await categories.find({ userId }, { session }).toArray();
  const records = await db.collection("career_records").find({ userId }, { session }).toArray();
  const changes = new Map<string, RecordChange>(records.map((record) => [String(record._id), { properties: { ...(record.properties ?? {}) }, unmapped: { ...(record.unmappedProperties ?? {}) }, changed: false }]));
  const sharedByKey = new Map(shared.map((category) => [String(category.key), category]));
  const categoryMap = new Map<string, string>();
  for (const template of templates) {
    const source = sharedByKey.get(template.key);
    if (source) categoryMap.set(String(source._id), categoryIdFor(userId, template.key));
  }
  const recordCategory = (record: Document) => categoryMap.get(String(record.categoryId)) ?? String(record.categoryId);

  // 사용자가 템플릿 키로 만든 카테고리는 키를 비켜 준다.
  const usedKeys = new Set(owned.map((category) => String(category.key)));
  for (const category of owned) {
    if (!templates.some((template) => template.key === category.key)) continue;
    let next = `${category.key}_custom`;
    for (let suffix = 2; usedKeys.has(next); suffix += 1) next = `${category.key}_custom${suffix}`;
    usedKeys.add(next);
    await categories.updateOne({ _id: category._id }, { $set: { key: next } }, { session });
  }

  const created = templates.map((template, sortOrder) => {
    const categoryId = categoryIdFor(userId, template.key);
    const source = sharedByKey.get(template.key);
    const sourceDefinitions = source ? legacyDefinitions(source) : [];
    const categoryRecords = records.filter((record) => recordCategory(record) === categoryId);
    const definitions: Definition[] = template.properties.map((property, order) => {
      const id = sourceDefinitions.find((definition) => definition.key === property.key)?.id ?? propertyIdFor(categoryId, property.key);
      const config = property.type === "select" || property.type === "multi_select"
        ? { options: (property.options ?? []).map((name) => ({ id: optionIdFor(id, name), name })) }
        : property.type === "relation" ? { targetCategoryId: categoryIdFor(userId, property.targetKey!), inversePropertyId: null, cardinality: "multiple", deletePolicy: "nullify" } : {};
      return { id, key: property.key, name: property.name, type: property.type, required: false, system: false, config, order, version: 1, deletedAt: null };
    });
    for (const definition of sourceDefinitions) {
      if (definitions.some((item) => item.key === definition.key)) continue;
      if (categoryRecords.some((record) => hasValue(changes.get(String(record._id))!.properties[definition.key]))) definitions.push({ ...definition, order: definitions.length });
    }
    convertCategory(definitions, categoryRecords, changes, counters);
    return { _id: categoryId, userId, key: template.key, name: template.name, icon: template.icon, defaultView: template.defaultView, sortOrder, propertySchemaV2: definitions, schemaVersion: 1, version: 1, updatedAt: now };
  });
  await categories.insertMany(created as never[], { session });

  for (const category of owned) {
    const definitions = replaceIds((category.propertySchemaV2 as Definition[] | undefined) ?? legacyDefinitions(category), categoryMap);
    convertCategory(definitions, records.filter((record) => record.categoryId === category._id), changes, counters);
    await categories.updateOne({ _id: category._id }, {
      $set: { propertySchemaV2: definitions, schemaVersion: category.schemaVersion ?? 1 },
      $unset: { propertySchema: "", isSystem: "", propertyMutationResults: "" },
    }, { session });
  }

  const recordWrites = records.flatMap((record) => {
    const change = changes.get(String(record._id))!;
    const categoryId = recordCategory(record);
    if (!change.changed && categoryId === record.categoryId) return [];
    return [{ updateOne: { filter: { _id: record._id }, update: { $set: { categoryId, properties: change.properties, ...(Object.keys(change.unmapped).length ? { unmappedProperties: change.unmapped } : {}) } } } }];
  });
  if (recordWrites.length) await db.collection("career_records").bulkWrite(recordWrites, { session });

  const views = await db.collection("career_views").find({ userId }, { session }).toArray();
  const viewWrites = views.flatMap((view) => {
    const { _id, userId: owner, ...rest } = view;
    const next = replaceIds(rest, categoryMap);
    return JSON.stringify(next) === JSON.stringify(rest) ? [] : [{ replaceOne: { filter: { _id }, replacement: { _id, userId: owner, ...next } } }];
  });
  if (viewWrites.length) await db.collection("career_views").bulkWrite(viewWrites as never[], { session });
  counters.users += 1;
}

async function categoryValidator(db: Db, strict: boolean) {
  const info = await db.listCollections({ name: "career_categories" }, { nameOnly: false }).next() as Document | null;
  if (!info) throw new Error("career_categories collection is missing");
  const validator = structuredClone((info.options.validator ?? {}) as Document);
  const schema = validator.$jsonSchema as Document;
  const properties = schema.properties as Document;
  properties.propertySchemaV2 = { bsonType: "array" };
  properties.schemaVersion = { bsonType: ["int", "long", "double"], minimum: 1, multipleOf: 1 };
  const required = (schema.required as string[]).filter((field) => field !== "isSystem" && field !== "propertySchema");
  if (strict) {
    delete properties.isSystem; delete properties.propertySchema;
    properties.userId = { ...properties.userId, bsonType: "string" };
    schema.required = [...new Set([...required, "userId", "propertySchemaV2"])];
  } else schema.required = required;
  await db.command({ collMod: "career_categories", validator, validationLevel: "strict", validationAction: "error" });
}

export async function careerCategoryOwnershipSteps(): Promise<MongoMigrationStep[]> {
  const templates = JSON.parse(await readFile(new URL("./templates.json", import.meta.url), "utf8")) as Template[];
  return [
    { id: "career_categories:relax_validator", run: (db: Db) => categoryValidator(db, false) },
    { id: "career_categories:copy_per_user", async run(db: Db) {
      const shared = await db.collection("career_categories").find({ userId: null }).toArray();
      const owners = new Set<string>([
        ...(await db.collection("users").find({}, { projection: { _id: 1 } }).toArray()).map((user) => String(user._id)),
        ...(await db.collection("career_records").distinct("userId")).map(String),
        ...(await db.collection("career_categories").distinct("userId", { userId: { $type: "string" } })).map(String),
      ]);
      const counters = { users: 0, unmapped: 0 };
      for (const userId of [...owners].sort()) {
        const session = db.client.startSession();
        try { await session.withTransaction(() => migrateUser(db, session, userId, templates, shared, counters)); }
        finally { await session.endSession(); }
      }
      const sharedIds = shared.map((category) => category._id);
      const leftRecords = await db.collection("career_records").countDocuments({ categoryId: { $in: sharedIds } });
      const leftViews = await db.collection("career_views").countDocuments({ categoryId: { $in: sharedIds } });
      if (leftRecords || leftViews) throw new Error(`shared career categories are still referenced: records=${leftRecords} views=${leftViews}`);
      console.info(`career_category_ownership: users=${counters.users} unmappedValues=${counters.unmapped}`);
    } },
    { id: "career_categories:remove_shared", async run(db: Db) {
      const categories = db.collection("career_categories");
      await categories.deleteMany({ userId: null });
      await categories.updateMany({}, { $unset: { propertySchema: "", isSystem: "", propertyMutationResults: "" } });
      if (await categories.indexExists("system_key_unique")) await categories.dropIndex("system_key_unique");
    } },
    { id: "career_categories:strict_validator", run: (db: Db) => categoryValidator(db, true) },
  ];
}
