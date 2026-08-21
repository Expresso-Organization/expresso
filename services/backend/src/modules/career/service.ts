import { createHash } from "node:crypto";

import {
  CareerCategorySchema,
  CareerDeleteImpactSchema,
  CareerPropertySchemaSchema,
  CareerRecordListResponseSchema,
  CareerRecordSchema,
  CareerProfileSchema,
  CareerSkillSchema,
  CareerViewSchema,
  type CareerCategory,
  type CareerProperties,
  type CareerPropertySchema,
  type CareerRecordSort,
  type CreateCareerCategory,
  type CreateCareerRecord,
  type CreateCareerView,
  type ListCareerRecordsQuery,
  type RecomputeCareerSkill,
  type SaveCareerProfile,
  type UpdateCareerRecord,
} from "@expresso/contracts";
import type { SqlTag, JSONValue } from "../../platform/mysql.js";

import { CareerError } from "./errors.js";
import { validateCareerProperties } from "./properties.js";
import { computeSkillAggregate, normalizeSkillName } from "./skills.js";

const DEFAULT_CATEGORY_KEYS = [
  "experience",
  "project",
  "education_history",
  "certification_award",
  "academic_writing",
  "activity_leadership",
  "skill_tool",
] as const;

interface CategoryRow {
  id: string;
  key: string;
  name: string;
  icon: string;
  default_view: CareerCategory["defaultView"];
  is_system: boolean;
  property_schema: CareerPropertySchema;
  sort_order: number;
  record_count: number;
  version: number;
}

interface RecordRow {
  id: string;
  user_id: string;
  category_id: string;
  title: string;
  status: "draft" | "organized" | "verified";
  origin: "manual" | "ai" | "interview" | "import";
  properties: CareerProperties;
  body_md: string;
  version: number;
  updated_at: Date | string;
  deleted_at: Date | string | null;
  purge_after: Date | string | null;
  create_request_hash?: string | null;
}

interface ViewRow {
  id: string;
  category_id: string;
  name: string;
  view_type: "table" | "gallery" | "timeline" | "board" | "list";
  filters: CreateCareerView["filters"];
  sorts: CreateCareerView["sorts"];
  visible_properties: string[];
  sort_order: number;
}

interface LinkRow {
  id: string;
  from_record_id: string;
  to_record_id: string;
  relation: "related" | "parent" | "duplicate_of";
}

interface SkillRecordRow {
  id: string;
  title: string;
  body_md: string;
  updated_at: Date | string;
}

interface SkillRow {
  id: string;
  name: string;
  level: number;
  evidence_count: number;
  strength: "weak" | "supported" | "strong";
  last_used_at: Date | string;
  computed_at: Date | string;
}

interface SkillEvidenceRow {
  record_id: string;
  record_title: string;
  extracted_span: {
    source: "title" | "body_md";
    start: number;
    end: number;
    quote: string;
  };
}

interface CountRow {
  count: number;
}

interface IdRow {
  id: string;
}

interface ImpactRow {
  portfolio_count: number;
  block_count: number;
}

interface RecordListRow extends RecordRow {
  category_key: string;
  period_from: string | null;
  period_to: string | null;
  link_count: number;
  used_in_count: number;
}

interface RecordSummaryRow {
  total: number;
  draft: number;
  organized: number;
  verified: number;
  empty: number;
}

/**
 * 커서는 정렬 키와 id를 함께 담는다. 정렬 값이 같은 행이 있어도 id가 tiebreaker라
 * 페이지 경계에서 누락·중복이 생기지 않는다.
 */
interface RecordCursor {
  sort: CareerRecordSort;
  key: string;
  id: string;
}

function encodeRecordCursor(cursor: RecordCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeRecordCursor(
  value: string | undefined,
  sort: CareerRecordSort,
): RecordCursor | null {
  if (!value) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    throw new CareerError(400, "invalid record cursor");
  }
  const cursor = parsed as Partial<RecordCursor>;
  if (
    typeof cursor?.key !== "string" ||
    typeof cursor.id !== "string" ||
    cursor.sort !== sort
  ) {
    // 정렬을 바꾸면 커서 의미가 달라지므로 이어받지 않는다.
    throw new CareerError(400, "record cursor does not match the sort order");
  }
  return { sort, key: cursor.key, id: cursor.id };
}

function isDescendingSort(sort: CareerRecordSort): boolean {
  return sort === "updated_desc" || sort === "period_desc";
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function requestHash(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function mapCategory(row: CategoryRow): CareerCategory {
  return CareerCategorySchema.parse({
    id: row.id,
    key: row.key,
    name: row.name,
    icon: row.icon,
    defaultView: row.default_view,
    isSystem: row.is_system,
    propertySchema: row.property_schema,
    sortOrder: row.sort_order,
    recordCount: Number(row.record_count),
    version: row.version,
  });
}

function mapRecord(row: RecordRow) {
  return CareerRecordSchema.parse({
    id: row.id,
    categoryId: row.category_id,
    title: row.title,
    status: row.status,
    origin: row.origin,
    properties: row.properties,
    bodyMd: row.body_md,
    version: row.version,
    updatedAt: new Date(row.updated_at).toISOString(),
  });
}

function mapView(row: ViewRow) {
  return CareerViewSchema.parse({
    id: row.id,
    categoryId: row.category_id,
    name: row.name,
    viewType: row.view_type,
    filters: row.filters,
    sorts: row.sorts,
    visibleProperties: row.visible_properties,
    sortOrder: row.sort_order,
  });
}

function mapSkill(row: SkillRow) {
  return CareerSkillSchema.parse({
    id: row.id,
    name: row.name,
    level: row.level,
    evidenceCount: row.evidence_count,
    strength: row.strength,
    lastUsedAt: new Date(row.last_used_at).toISOString(),
    computedAt: new Date(row.computed_at).toISOString(),
  });
}

interface CareerProfileRow {
  target_roles: string[];
  experience_years: number;
  primary_goal: string;
  updated_at: Date | string;
}

function mapCareerProfile(row: CareerProfileRow) {
  return CareerProfileSchema.parse({
    targetRoles: row.target_roles,
    experienceYears: row.experience_years,
    primaryGoal: row.primary_goal,
    updatedAt: new Date(row.updated_at).toISOString(),
  });
}

export class CareerService {
  readonly #sql: SqlTag;

  constructor(sql: SqlTag) {
    this.#sql = sql;
  }

  async listCategories(userId: string): Promise<CareerCategory[]> {
    const rows = await this.#sql<CategoryRow[]>`
      select
        category.id,
        category.key,
        category.name,
        category.icon,
        category.default_view,
        category.is_system,
        category.property_schema,
        category.sort_order,
        category.version,
        count(record.id) as record_count
      from category
      left join record on record.category_id = category.id
        and record.user_id = ${userId}
        and record.deleted_at is null
      where category.user_id is null or category.user_id = ${userId}
      group by category.id
      order by category.is_system desc, category.sort_order, category.id
    `;
    const systemKeys = rows
      .filter((row) => row.is_system)
      .map((row) => row.key);
    if (DEFAULT_CATEGORY_KEYS.some((key) => !systemKeys.includes(key))) {
      throw new Error("default career categories are not installed");
    }
    return rows.map(mapCategory);
  }

  /**
   * 05–05e 목록. 정렬 키와 id를 함께 쓰는 keyset 페이지네이션이라 목록이 갱신되는 중에도
   * 페이지 경계에서 행이 새거나 겹치지 않는다.
   */
  async listRecords(userId: string, query: ListCareerRecordsQuery) {
    const sql = this.#sql;
    const cursor = decodeRecordCursor(query.cursor, query.sort);
    const descending = isDescendingSort(query.sort);

    // 커서 값이 SQL이 만든 정렬 키와 정확히 같아야 하므로 표현식을 한 곳에서만 정의한다.
    const sortKey = () => {
      if (query.sort === "title_asc") return sql`record.title`;
      if (query.sort === "period_desc") {
        return sql`coalesce(lower(record.period)::text, '0001-01-01')`;
      }
      if (query.sort === "period_asc") {
        return sql`coalesce(lower(record.period)::text, '9999-12-31')`;
      }
      return sql`to_char(record.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
    };

    const scope = () => sql`
      record.user_id = ${userId}
      and record.deleted_at is null
      ${query.categoryId ? sql`and record.category_id = ${query.categoryId}` : sql``}
      ${query.status ? sql`and record.status = ${query.status}` : sql``}
      ${query.origin ? sql`and record.origin = ${query.origin}` : sql``}
      ${query.q ? sql`and record.title ilike ${`%${query.q}%`}` : sql``}
    `;

    const rows = await sql<RecordListRow[]>`
      select
        record.id,
        record.user_id,
        record.category_id,
        category.key as category_key,
        record.title,
        record.status,
        record.origin,
        record.properties,
        record.body_md,
        record.version,
        record.updated_at,
        record.deleted_at,
        record.purge_after,
        lower(record.period) as period_from,
        upper(record.period) as period_to,
        ${sortKey()} as sort_key,
        (
          select count(*) from record_link
          where record_link.user_id = record.user_id
            and (record_link.from_record_id = record.id or record_link.to_record_id = record.id)
        ) as link_count,
        (
          select count(distinct portfolio_section.portfolio_id)
          from record_usage
          join block on block.id = record_usage.block_id
            and block.user_id = record_usage.user_id
          join portfolio_section on portfolio_section.id = block.portfolio_section_id
            and portfolio_section.user_id = block.user_id
          where record_usage.user_id = record.user_id
            and record_usage.record_id = record.id
        ) as used_in_count
      from record
      join category on category.id = record.category_id
      where ${scope()}
        ${cursor && descending
          ? sql`and (${sortKey()}, record.id) < (${cursor.key}, ${cursor.id}::uuid)`
          : sql``}
        ${cursor && !descending
          ? sql`and (${sortKey()}, record.id) > (${cursor.key}, ${cursor.id}::uuid)`
          : sql``}
      order by ${sortKey()} ${descending ? sql`desc` : sql`asc`},
        record.id ${descending ? sql`desc` : sql`asc`}
      limit ${query.limit + 1}
    `;

    const hasNextPage = rows.length > query.limit;
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);

    const [summary] = await sql<RecordSummaryRow[]>`
      select
        count(*) as total,
        count(case when record.status = 'draft' then 1 end) as draft,
        count(case when record.status = 'organized' then 1 end) as organized,
        count(case when record.status = 'verified' then 1 end) as verified,
        count(case when record.body_md = '' and record.properties = '{}' then 1 end) as empty
      from record
      where ${scope()}
    `;

    return CareerRecordListResponseSchema.parse({
      data: page.map((row) => ({
        ...mapRecord(row),
        categoryKey: row.category_key,
        isEmpty: row.body_md === "" && Object.keys(row.properties).length === 0,
        periodFrom: row.period_from,
        periodTo: row.period_to,
        linkCount: Number(row.link_count),
        usedInCount: Number(row.used_in_count),
      })),
      page: {
        hasNextPage,
        nextCursor: hasNextPage && last
          ? encodeRecordCursor({
              sort: query.sort,
              key: (last as RecordListRow & { sort_key: string }).sort_key,
              id: last.id,
            })
          : null,
      },
      summary: {
        total: Number(summary?.total ?? 0),
        draft: Number(summary?.draft ?? 0),
        organized: Number(summary?.organized ?? 0),
        verified: Number(summary?.verified ?? 0),
        empty: Number(summary?.empty ?? 0),
      },
    });
  }

  async createCategory(
    userId: string,
    input: CreateCareerCategory,
  ): Promise<CareerCategory> {
    const propertySchema = CareerPropertySchemaSchema.parse(input.propertySchema);
    const rows = await this.#sql<CategoryRow[]>`
      insert into category (
        user_id, key, name, icon, default_view,
        is_system, property_schema, sort_order
      )
      values (
        ${userId}, ${input.key}, ${input.name}, ${input.icon},
        ${input.defaultView}, false,
        ${this.#sql.json(propertySchema as JSONValue)},
        (select 7 + count(*) from category where user_id = ${userId})
      )
      returning id, key, name, icon, default_view, is_system,
        property_schema, sort_order, version, 0 as record_count
    `;
    const category = rows[0];
    if (!category) throw new Error("career category was not persisted");
    return mapCategory(category);
  }

  async updatePropertySchema(
    userId: string,
    categoryId: string,
    expectedVersion: number,
    nextSchemaInput: CareerPropertySchema,
    confirmValueRemoval: boolean,
  ): Promise<CareerCategory> {
    const nextSchema = CareerPropertySchemaSchema.parse(nextSchemaInput);
    return this.#sql.begin(async (transaction) => {
      const existingRows = await transaction<CategoryRow[]>`
        select id, key, name, icon, default_view, is_system,
          property_schema, sort_order, version, 0 as record_count
        from category
        where id = ${categoryId} and user_id = ${userId} and not is_system
        for update
      `;
      const existing = existingRows[0];
      if (!existing) throw new CareerError(404, "career category not found");
      if (existing.version !== expectedVersion) {
        throw new CareerError(412, "category version is stale");
      }

      const removedKeys = Object.keys(existing.property_schema)
        .filter((key) => !Object.hasOwn(nextSchema, key));
      const protectedKeys = removedKeys.filter(
        (key) => existing.property_schema[key]?.system,
      );
      if (protectedKeys.length > 0) {
        throw new CareerError(403, "system properties cannot be removed", {
          protectedProperties: protectedKeys,
        });
      }

      const propertyValueCounts: Record<string, number> = {};
      for (const key of removedKeys) {
        const counts = await transaction<CountRow[]>`
          select count(*) as count
          from record
          where user_id = ${userId}
            and category_id = ${categoryId}
            and deleted_at is null
            and properties ? ${key}
        `;
        const count = Number(counts[0]?.count ?? 0);
        if (count > 0) propertyValueCounts[key] = count;
      }
      if (Object.keys(propertyValueCounts).length > 0 && !confirmValueRemoval) {
        throw new CareerError(409, "category properties still contain values", {
          propertyValueCounts,
        });
      }

      for (const key of Object.keys(propertyValueCounts)) {
        await transaction`
          update record
          set properties = properties - ${key}
          where user_id = ${userId}
            and category_id = ${categoryId}
            and properties ? ${key}
        `;
      }
      const updatedRows = await transaction<CategoryRow[]>`
        update category
        set property_schema = ${transaction.json(nextSchema as JSONValue)}
        where id = ${categoryId}
          and user_id = ${userId}
          and version = ${expectedVersion}
        returning id, key, name, icon, default_view, is_system,
          property_schema, sort_order, version, 0 as record_count
      `;
      const updated = updatedRows[0];
      if (!updated) throw new CareerError(412, "category version is stale");
      return mapCategory(updated);
    });
  }

  async createRecord(
    userId: string,
    idempotencyKey: string,
    input: CreateCareerRecord,
  ): Promise<{ record: ReturnType<typeof mapRecord>; created: boolean }> {
    const hash = requestHash(input);
    return this.#sql.begin(async (transaction) => {
      const categoryRows = await transaction<Pick<CategoryRow, "property_schema">[]>`
        select property_schema
        from category
        where id = ${input.categoryId}
          and (user_id is null or user_id = ${userId})
      `;
      const category = categoryRows[0];
      if (!category) throw new CareerError(404, "career category not found");
      validateCareerProperties(category.property_schema, input.properties);

      const inserted = await transaction<RecordRow[]>`
        insert into record (
          user_id, category_id, title, status, origin,
          properties, body_md, create_idempotency_key, create_request_hash
        )
        values (
          ${userId}, ${input.categoryId}, ${input.title}, 'draft', 'manual',
          ${transaction.json(input.properties as JSONValue)},
          ${input.bodyMd}, ${idempotencyKey}, ${hash}
        )
        on conflict (user_id, create_idempotency_key)
          where create_idempotency_key is not null
        do nothing
        returning *
      `;
      const created = inserted[0];
      if (created) return { record: mapRecord(created), created: true };

      const existingRows = await transaction<RecordRow[]>`
        select * from record
        where user_id = ${userId}
          and create_idempotency_key = ${idempotencyKey}
      `;
      const existing = existingRows[0];
      if (!existing) throw new Error("idempotent career record was not found");
      if (existing.create_request_hash !== hash) {
        throw new CareerError(409, "idempotency key was reused with another request");
      }
      return { record: mapRecord(existing), created: false };
    });
  }

  async getRecord(userId: string, recordId: string) {
    const rows = await this.#sql<RecordRow[]>`
      select * from record
      where id = ${recordId} and user_id = ${userId} and deleted_at is null
    `;
    const record = rows[0];
    if (!record) throw new CareerError(404, "career record not found");
    return mapRecord(record);
  }

  async updateRecord(
    userId: string,
    recordId: string,
    expectedVersion: number,
    input: UpdateCareerRecord,
  ) {
    return this.#sql.begin(async (transaction) => {
      const rows = await transaction<(RecordRow & { property_schema: CareerPropertySchema })[]>`
        select record.*, category.property_schema
        from record
        join category on category.id = record.category_id
        where record.id = ${recordId}
          and record.user_id = ${userId}
          and record.deleted_at is null
      `;
      const existing = rows[0];
      if (!existing) throw new CareerError(404, "career record not found");
      if (existing.version !== expectedVersion) {
        throw new CareerError(412, "career record version is stale");
      }
      const properties = input.properties ?? existing.properties;
      validateCareerProperties(existing.property_schema, properties);

      const updatedRows = await transaction<RecordRow[]>`
        update record
        set title = ${input.title ?? existing.title},
            properties = ${transaction.json(properties as JSONValue)},
            body_md = ${input.bodyMd ?? existing.body_md}
        where id = ${recordId}
          and user_id = ${userId}
          and deleted_at is null
          and version = ${expectedVersion}
        returning *
      `;
      const updated = updatedRows[0];
      if (!updated) throw new CareerError(412, "career record version is stale");
      return mapRecord(updated);
    });
  }

  async createView(
    userId: string,
    categoryId: string,
    input: CreateCareerView,
  ) {
    return this.#sql.begin(async (transaction) => {
      const categories = await transaction<Pick<CategoryRow, "property_schema">[]>`
        select property_schema from category
        where id = ${categoryId} and (user_id is null or user_id = ${userId})
      `;
      const category = categories[0];
      if (!category) throw new CareerError(404, "career category not found");
      const allowedFields = new Set([
        "title",
        "status",
        "period",
        ...Object.keys(category.property_schema),
      ]);
      for (const field of [
        ...input.filters.map(({ property }) => property),
        ...input.sorts.map(({ property }) => property),
        ...input.visibleProperties,
      ]) {
        if (!allowedFields.has(field)) {
          throw new CareerError(400, `view references an unknown property: ${field}`);
        }
      }
      if (
        input.viewType === "timeline"
        && !Object.values(category.property_schema).some(({ type }) => type === "date")
      ) {
        throw new CareerError(400, "timeline views require a date property");
      }
      const counts = await transaction<CountRow[]>`
        select count(*) as count from category_view
        where user_id = ${userId} and category_id = ${categoryId}
      `;
      if (Number(counts[0]?.count ?? 0) >= 8) {
        throw new CareerError(409, "category view limit exceeded");
      }
      const rows = await transaction<ViewRow[]>`
        insert into category_view (
          user_id, category_id, name, view_type,
          filters, sorts, visible_properties, sort_order
        )
        values (
          ${userId}, ${categoryId}, ${input.name}, ${input.viewType},
          ${transaction.json(input.filters as JSONValue)},
          ${transaction.json(input.sorts as JSONValue)},
          ${input.visibleProperties}, ${Number(counts[0]?.count ?? 0)}
        )
        returning *
      `;
      const view = rows[0];
      if (!view) throw new Error("career view was not persisted");
      return mapView(view);
    });
  }

  async listViews(userId: string, categoryId: string) {
    const categories = await this.#sql<IdRow[]>`
      select id from category
      where id = ${categoryId} and (user_id is null or user_id = ${userId})
    `;
    if (!categories[0]) throw new CareerError(404, "career category not found");
    const rows = await this.#sql<ViewRow[]>`
      select * from category_view
      where user_id = ${userId} and category_id = ${categoryId}
      order by sort_order, id
    `;
    return rows.map(mapView);
  }

  async createLink(
    userId: string,
    recordId: string,
    toRecordId: string,
    relation: LinkRow["relation"],
  ) {
    if (recordId === toRecordId) throw new CareerError(400, "record cannot link itself");
    const records = await this.#sql<{ id: string }[]>`
      select id from record
      where user_id = ${userId}
        and id in (${recordId}, ${toRecordId})
        and deleted_at is null
    `;
    if (records.length !== 2) throw new CareerError(404, "career record not found");
    const canonical = relation === "parent"
      ? [recordId, toRecordId]
      : [recordId, toRecordId].sort();
    const fromRecordId = canonical[0];
    const targetRecordId = canonical[1];
    if (!fromRecordId || !targetRecordId) {
      throw new Error("career link endpoints were not resolved");
    }
    const rows = await this.#sql<LinkRow[]>`
      insert into record_link (
        user_id, from_record_id, to_record_id, relation, created_by
      )
      values (${userId}, ${fromRecordId}, ${targetRecordId}, ${relation}, 'user')
      as new on duplicate key update created_by = record_link.created_by
      returning id, from_record_id, to_record_id, relation
    `;
    const link = rows[0];
    if (!link) throw new Error("career record link was not persisted");
    return link;
  }

  async listLinks(userId: string, recordId: string) {
    const records = await this.#sql<IdRow[]>`
      select id from record
      where id = ${recordId} and user_id = ${userId} and deleted_at is null
    `;
    if (!records[0]) throw new CareerError(404, "career record not found");
    const rows = await this.#sql<LinkRow[]>`
      select id, from_record_id, to_record_id, relation
      from record_link
      where user_id = ${userId}
        and (from_record_id = ${recordId} or to_record_id = ${recordId})
      order by id
    `;
    return rows.map((row) => ({
      id: row.id,
      recordId,
      relatedRecordId: row.from_record_id === recordId
        ? row.to_record_id
        : row.from_record_id,
      relation: row.relation,
      direction: row.from_record_id === recordId ? "outgoing" as const : "incoming" as const,
    }));
  }

  async getDeleteImpact(userId: string, recordId: string, at = new Date()) {
    const records = await this.#sql<IdRow[]>`
      select id from record
      where id = ${recordId} and user_id = ${userId} and deleted_at is null
    `;
    if (!records[0]) throw new CareerError(404, "career record not found");
    const impacts = await this.#sql<ImpactRow[]>`
      select
        count(distinct portfolio_section.portfolio_id) as portfolio_count,
        count(distinct record_usage.block_id) as block_count
      from record_usage
      left join block on block.id = record_usage.block_id
        and block.user_id = record_usage.user_id
      left join portfolio_section on portfolio_section.id = block.portfolio_section_id
        and portfolio_section.user_id = block.user_id
      where record_usage.user_id = ${userId}
        and record_usage.record_id = ${recordId}
    `;
    return CareerDeleteImpactSchema.parse({
      recordId,
      portfolioCount: Number(impacts[0]?.portfolio_count ?? 0),
      blockCount: Number(impacts[0]?.block_count ?? 0),
      deletedAt: at.toISOString(),
      purgeAfter: new Date(at.getTime() + 30 * 24 * 60 * 60 * 1_000).toISOString(),
    });
  }

  async trashRecord(userId: string, recordId: string, at = new Date()) {
    return this.#sql.begin(async (transaction) => {
      const impacts = await transaction<ImpactRow[]>`
        select
          count(distinct portfolio_section.portfolio_id) as portfolio_count,
          count(distinct record_usage.block_id) as block_count
        from record_usage
        left join block on block.id = record_usage.block_id
          and block.user_id = record_usage.user_id
        left join portfolio_section on portfolio_section.id = block.portfolio_section_id
          and portfolio_section.user_id = block.user_id
        where record_usage.user_id = ${userId}
          and record_usage.record_id = ${recordId}
      `;
      const rows = await transaction<RecordRow[]>`
        update record
        set deleted_at = ${at}, purge_after = ${at} + interval 30 day
        where id = ${recordId} and user_id = ${userId} and deleted_at is null
        returning *
      `;
      const record = rows[0];
      if (!record || !record.deleted_at || !record.purge_after) {
        throw new CareerError(404, "career record not found");
      }
      return CareerDeleteImpactSchema.parse({
        recordId,
        portfolioCount: Number(impacts[0]?.portfolio_count ?? 0),
        blockCount: Number(impacts[0]?.block_count ?? 0),
        deletedAt: new Date(record.deleted_at).toISOString(),
        purgeAfter: new Date(record.purge_after).toISOString(),
      });
    });
  }

  async restoreRecord(userId: string, recordId: string, at = new Date()) {
    const rows = await this.#sql<RecordRow[]>`
      update record
      set deleted_at = null, purge_after = null
      where id = ${recordId}
        and user_id = ${userId}
        and deleted_at is not null
        and purge_after > ${at}
      returning *
    `;
    const record = rows[0];
    if (!record) throw new CareerError(404, "restorable career record not found");
    return mapRecord(record);
  }

  async recomputeSkill(
    userId: string,
    input: RecomputeCareerSkill,
    computedAt = new Date(),
  ) {
    const name = normalizeSkillName(input.name);
    if (!name) throw new CareerError(400, "skill name is empty");
    const ids = input.evidence.map(({ recordId }) => recordId);
    if (new Set(ids).size !== ids.length) {
      throw new CareerError(400, "one evidence span is allowed per record");
    }

    return this.#sql.begin(async (transaction) => {
      const records = await transaction<SkillRecordRow[]>`
        select record.id, record.title, record.body_md, record.updated_at
        from record
        join category on category.id = record.category_id
        where record.user_id = ${userId}
          and record.deleted_at is null
          and category.is_system
          and record.id = any(${ids}[])
      `;
      if (records.length !== ids.length) {
        throw new CareerError(404, "skill evidence record not found");
      }
      const byId = new Map(records.map((record) => [record.id, record]));
      for (const evidence of input.evidence) {
        const record = byId.get(evidence.recordId);
        if (!record) throw new CareerError(404, "skill evidence record not found");
        const source = evidence.span.source === "title" ? record.title : record.body_md;
        if (source.slice(evidence.span.start, evidence.span.end) !== evidence.span.quote) {
          throw new CareerError(400, "skill evidence span does not match record source");
        }
      }

      const lastUsedAt = new Date(Math.max(
        ...records.map(({ updated_at }) => new Date(updated_at).getTime()),
      ));
      const aggregate = computeSkillAggregate(
        input.evidence.length,
        lastUsedAt,
        computedAt,
      );
      const skills = await transaction<SkillRow[]>`
        insert into skill (
          user_id, name, level, computed_at,
          evidence_count, last_used_at, strength
        )
        values (
          ${userId}, ${name}, ${aggregate.level}, ${computedAt},
          ${input.evidence.length}, ${lastUsedAt}, ${aggregate.strength}
        )
        as new on duplicate key update level = new.level,
          computed_at = new.computed_at,
          evidence_count = new.evidence_count,
          last_used_at = new.last_used_at,
          strength = new.strength
        returning *
      `;
      const skill = skills[0];
      if (!skill) throw new Error("career skill was not persisted");
      await transaction`
        delete from skill_evidence where user_id = ${userId} and skill_id = ${skill.id}
      `;
      for (const evidence of input.evidence) {
        await transaction`
          insert into skill_evidence (
            user_id, skill_id, record_id, weight, extracted_span
          )
          values (
            ${userId}, ${skill.id}, ${evidence.recordId}, 1,
            ${transaction.json(evidence.span as JSONValue)}
          )
        `;
      }
      return mapSkill(skill);
    });
  }

  async listSkills(userId: string) {
    const rows = await this.#sql<SkillRow[]>`
      select * from skill
      where user_id = ${userId} and evidence_count > 0
      order by level desc, evidence_count desc, name
    `;
    return rows.map(mapSkill);
  }

  async listSkillEvidence(userId: string, skillId: string) {
    const rows = await this.#sql<SkillEvidenceRow[]>`
      select
        skill_evidence.record_id,
        record.title as record_title,
        skill_evidence.extracted_span
      from skill_evidence
      join skill on skill.id = skill_evidence.skill_id
        and skill.user_id = skill_evidence.user_id
      join record on record.id = skill_evidence.record_id
        and record.user_id = skill_evidence.user_id
      where skill_evidence.user_id = ${userId}
        and skill_evidence.skill_id = ${skillId}
        and record.deleted_at is null
      order by record.updated_at desc, record.id
    `;
    if (rows.length === 0) {
      const skills = await this.#sql<IdRow[]>`
        select id from skill where id = ${skillId} and user_id = ${userId}
      `;
      if (!skills[0]) throw new CareerError(404, "career skill not found");
    }
    return rows.map((row) => ({
      recordId: row.record_id,
      recordTitle: row.record_title,
      span: row.extracted_span,
    }));
  }

  /* ── 온보딩 1단계 · 커리어 프로필 (화면 10c) ── */

  /** 아직 온보딩을 지나지 않았으면 null이다. 없는 것을 기본값으로 꾸미지 않는다. */
  async getProfile(userId: string) {
    const rows = await this.#sql<CareerProfileRow[]>`
      select target_roles, experience_years, primary_goal, updated_at
      from career_profile
      where user_id = ${userId}
    `;
    const row = rows[0];
    return row ? mapCareerProfile(row) : null;
  }

  /**
   * 통째로 덮어쓴다. 화면이 세 값을 한 번에 정하므로 부분 갱신이 없고,
   * 온보딩을 다시 지나거나 나중에 설정에서 고쳐도 같은 문 하나를 쓴다.
   */
  async saveProfile(userId: string, input: SaveCareerProfile) {
    // 같은 칩을 두 번 담아 보내도 한 번만 남는다.
    const targetRoles = [...new Set(input.targetRoles)];
    const rows = await this.#sql<CareerProfileRow[]>`
      insert into career_profile (user_id, target_roles, experience_years, primary_goal)
      values (
        ${userId},
        ${this.#sql.array(targetRoles)},
        ${input.experienceYears},
        ${input.primaryGoal}
      )
      as new on duplicate key update target_roles = new.target_roles,
        experience_years = new.experience_years,
        primary_goal = new.primary_goal,
        updated_at = now()
      returning target_roles, experience_years, primary_goal, updated_at
    `;
    const row = rows[0];
    if (!row) throw new Error("career profile was not persisted");
    return mapCareerProfile(row);
  }
}
