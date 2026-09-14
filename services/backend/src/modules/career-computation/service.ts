import {
  CareerFormulaPreviewSchema,
  CareerPropertyValueV2Schema,
  CareerRollupPreviewSchema,
  PreviewCareerFormulaSchema,
  PreviewCareerRollupSchema,
  type CareerFormulaPreview,
  type CareerPropertyDefinitionV2,
  type CareerPropertyValueV2,
  type CareerRollupPreview,
  type PreviewCareerFormula,
  type PreviewCareerRollup,
  WritableCareerPropertyValueSchema,
} from "@expresso/contracts";
import {
  aggregateRollup,
  buildDependencyGraph,
  collectFormulaDependencies,
  detectCycles,
  evaluateFormula,
  parseFormula,
  typecheckFormula,
  type FormulaAst,
  type FormulaDiagnostic,
  type FormulaPropertyDefinition,
  type FormulaPropertyValue,
} from "@expresso/editor";
import type { CareerCategoryDoc, CareerRecordDoc } from "@expresso/database";
import { Decimal128, type Document, type Filter, type UpdateFilter } from "mongodb";

import { addMongoOutboxEvent } from "../../platform/mongo-outbox.js";
import { inTransaction } from "../../platform/mongo-transaction.js";
import type { MongoContext } from "../../platform/mongodb.js";
import { MongoCareerComputationRepository } from "./repository.js";

export interface CareerComputationEvent {
  eventId: string;
  userId: string;
  recordId: string;
  changedPropertyIds: readonly string[];
  sourceRecordVersion: number;
  sourcePropertyVersions?: Readonly<Record<string, number>>;
}
export interface CareerComputationService {
  recompute(event: CareerComputationEvent): Promise<"applied" | "stale" | "duplicate">;
  previewFormula(userId: string, input: PreviewCareerFormula): Promise<CareerFormulaPreview>;
  previewRollup(userId: string, input: PreviewCareerRollup): Promise<CareerRollupPreview>;
}
export interface CareerComputationApi extends CareerComputationService {}

interface ComputationMetadata { readonly eventIds?: readonly string[]; readonly sourceRecordVersion?: number }
interface DerivedDefinition extends CareerPropertyDefinitionV2 { readonly ast?: FormulaAst | null; readonly dependencies: readonly string[] }

function definitions(category: CareerCategoryDoc): CareerPropertyDefinitionV2[] {
  return category.propertyDefinitions ?? category.propertySchemaV2 ?? Object.entries(category.propertySchema).map(([key, property], order) => ({
    id: property.id ?? key, key, name: property.label,
    type: property.type === "boolean" ? "checkbox" : property.type === "tags" ? "multi_select" : property.type,
    required: property.required, system: property.system, config: {}, order, version: 1, deletedAt: null,
  }));
}
function activeDefinitions(category: CareerCategoryDoc): CareerPropertyDefinitionV2[] { return definitions(category).filter((definition) => definition.deletedAt === null); }
function editorSchema(definitions_: readonly CareerPropertyDefinitionV2[]): FormulaPropertyDefinition[] {
  return definitions_.map((definition) => ({ id: definition.id, type: definition.type, deletedAt: definition.deletedAt }));
}
function formulaDiagnostic(error: unknown): FormulaDiagnostic {
  const known = error as { message?: unknown; start?: unknown; end?: unknown; code?: unknown };
  return {
    code: known.code === "limit_exceeded" ? "limit_exceeded" : "parse_error",
    message: typeof known.message === "string" ? known.message : "수식을 해석할 수 없습니다",
    severity: "error", start: typeof known.start === "number" ? known.start : 0, end: typeof known.end === "number" ? known.end : 0,
  };
}
function asValue(value: unknown, definition: CareerPropertyDefinitionV2): FormulaPropertyValue | null {
  const parsed = CareerPropertyValueV2Schema.safeParse(value);
  if (parsed.success) return { type: parsed.data.type, value: parsed.data.value };
  if (value === undefined) return null;
  return { type: definition.type, value };
}
function configFormula(definition: CareerPropertyDefinitionV2): { source: string; ast: FormulaAst | null; diagnostics: readonly FormulaDiagnostic[] } {
  const source = typeof definition.config.source === "string" ? definition.config.source : "";
  if (!source) return { source, ast: null, diagnostics: [{ code: "parse_error", message: "수식 source가 없습니다", severity: "error", start: 0, end: 0 }] };
  try {
    const ast = parseFormula(source);
    return { source, ast, diagnostics: typecheckFormula(ast, []) };
  } catch (error) { return { source, ast: null, diagnostics: [formulaDiagnostic(error)] }; }
}
function rollupDependencies(definition: CareerPropertyDefinitionV2): readonly string[] {
  return typeof definition.config.relationPropertyId === "string" && typeof definition.config.targetPropertyId === "string"
    ? [definition.config.relationPropertyId, definition.config.targetPropertyId] : [];
}
function derivedDefinitions(category: CareerCategoryDoc): DerivedDefinition[] {
  const all = activeDefinitions(category);
  const schema = editorSchema(all);
  return all.flatMap((definition): DerivedDefinition[] => {
    if (definition.type === "formula") {
      const configured = configFormula(definition);
      const diagnostics = configured.ast ? typecheckFormula(configured.ast, schema) : configured.diagnostics;
      return [{ ...definition, ast: configured.ast, dependencies: configured.ast ? collectFormulaDependencies(configured.ast) : [] }];
    }
    if (definition.type === "rollup") return [{ ...definition, dependencies: rollupDependencies(definition) }];
    return [];
  });
}
function computedMap(record: CareerRecordDoc): Record<string, unknown> { return { ...(record.computedProperties ?? {}) } as Record<string, unknown>; }
function metadata(computed: Record<string, unknown>): ComputationMetadata { const value = computed.__expressoComputation; return value && typeof value === "object" ? value as ComputationMetadata : {}; }
function canonical(value: unknown): string { return JSON.stringify(value); }
function derivedClosure(definitions_: readonly DerivedDefinition[], changed: readonly string[]): readonly DerivedDefinition[] {
  const affected = new Set(changed);
  const selected = new Map<string, DerivedDefinition>();
  let added = true;
  while (added) {
    added = false;
    for (const definition of definitions_) if (!selected.has(definition.id) && (affected.has(definition.id) || definition.dependencies.some((dependency) => affected.has(dependency)))) {
      selected.set(definition.id, definition); affected.add(definition.id); added = true;
    }
  }
  return [...selected.values()];
}
function orderedDerived(definitions_: readonly DerivedDefinition[]): readonly DerivedDefinition[] {
  const byId = new Map(definitions_.map((definition) => [definition.id, definition]));
  const result: DerivedDefinition[] = []; const visited = new Set<string>();
  const visit = (id: string): void => { if (visited.has(id)) return; visited.add(id); const definition = byId.get(id); if (!definition) return; definition.dependencies.forEach(visit); result.push(definition); };
  [...byId.keys()].sort().forEach(visit);
  return result;
}
function valueFor(record: CareerRecordDoc, definitions_: readonly CareerPropertyDefinitionV2[], propertyId: string, computed: Record<string, unknown>): FormulaPropertyValue | null {
  return resolveComputationValue({ propertySchema: {}, propertySchemaV2: [...definitions_] } as CareerCategoryDoc, record, propertyId, computed);
}
function parseComputed(value: FormulaPropertyValue | null, type: "formula" | "rollup"): CareerPropertyValueV2 | null {
  if (!value) return null;
  const parsed = CareerPropertyValueV2Schema.safeParse({ ...value, type });
  return parsed.success ? parsed.data : null;
}

export class MongoCareerComputationService implements CareerComputationService {
  readonly repository: MongoCareerComputationRepository;
  constructor(readonly context: MongoContext) { this.repository = new MongoCareerComputationRepository(context); }

  async previewFormula(userId: string, raw: PreviewCareerFormula): Promise<CareerFormulaPreview> {
    const input = PreviewCareerFormulaSchema.parse(raw);
    const category = await this.repository.readableCategory(userId, input.categoryId);
    if (!category) throw new Error("career category not found");
    const all = activeDefinitions(category);
    let ast: FormulaAst | null = null;
    let diagnostics: readonly FormulaDiagnostic[];
    try { ast = parseFormula(input.source); diagnostics = typecheckFormula(ast, editorSchema(all)); }
    catch (error) { diagnostics = [formulaDiagnostic(error)]; }
    if (ast && input.propertyId) {
      const graphDefinitions = activeDefinitions(category).flatMap((definition) => {
        if (definition.type !== "formula") return [];
        if (definition.id === input.propertyId) return [{ id: definition.id, type: definition.type, ast }];
        const configured = configFormula(definition);
        return configured.ast ? [{ id: definition.id, type: definition.type, ast: configured.ast }] : [];
      });
      const cycles = detectCycles(buildDependencyGraph(graphDefinitions));
      if (cycles.some((cycle) => cycle.includes(input.propertyId!))) diagnostics = [...diagnostics, { code: "cycle", message: "수식 의존성에 순환이 있습니다", severity: "error", start: 0, end: input.source.length }];
    }
    const dependencies = ast ? collectFormulaDependencies(ast) : [];
    let value: CareerPropertyValueV2 | null = null;
    if (input.recordId && ast && diagnostics.length === 0) {
      const record = await this.repository.activeRecord(userId, input.recordId);
      if (!record || record.categoryId !== input.categoryId) throw new Error("career record not found");
      const computed = computedMap(record);
      const context = new Map(all.map((definition) => [definition.id, valueFor(record, all, definition.id, computed)]));
      value = parseComputed(evaluateFormula(ast, context), "formula");
    }
    return CareerFormulaPreviewSchema.parse({ source: input.source, ast, diagnostics, value, dependencies });
  }

  async previewRollup(userId: string, raw: PreviewCareerRollup): Promise<CareerRollupPreview> {
    const input = PreviewCareerRollupSchema.parse(raw);
    const category = await this.repository.readableCategory(userId, input.categoryId);
    if (!category) throw new Error("career category not found");
    const all = activeDefinitions(category);
    const relation = all.find((definition) => definition.id === input.relationPropertyId && definition.type === "relation");
    const targetCategoryId = relation?.config.targetCategoryId;
    const targetCategory = typeof targetCategoryId === "string" ? await this.repository.readableCategory(userId, targetCategoryId) : null;
    const target = targetCategory ? activeDefinitions(targetCategory).find((definition) => definition.id === input.targetPropertyId) : undefined;
    if (!relation || !target) return CareerRollupPreviewSchema.parse({ diagnostics: [{ code: "unknown_property", message: "관계 또는 대상 프로퍼티를 찾을 수 없습니다", severity: "error", start: 0, end: 0 }], value: null });
    const numeric = ["sum", "average", "min", "max"].includes(input.aggregation);
    const temporal = ["earliest", "latest"].includes(input.aggregation);
    const checked = input.aggregation === "percent_checked";
    if ((numeric && target.type !== "number") || (temporal && !["date", "created_time", "updated_time"].includes(target.type)) || (checked && target.type !== "checkbox")) {
      return CareerRollupPreviewSchema.parse({ diagnostics: [{ code: "argument_type", message: "선택한 집계와 대상 프로퍼티 타입이 맞지 않습니다", severity: "error", start: 0, end: 0 }], value: null });
    }
    if (!input.recordId) return CareerRollupPreviewSchema.parse({ diagnostics: [], value: null });
    const record = await this.repository.activeRecord(userId, input.recordId);
    if (!record || record.categoryId !== input.categoryId) throw new Error("career record not found");
    const value = await this.rollupForRecord(userId, record, all, relation.id, target.id, input.aggregation);
    return CareerRollupPreviewSchema.parse({ diagnostics: [], value: parseComputed(value, "rollup") });
  }

  async recompute(event: CareerComputationEvent): Promise<"applied" | "stale" | "duplicate"> {
    return inTransaction(this.context, async (tx) => {
      const repository = new MongoCareerComputationRepository(tx);
      const record = await repository.activeRecord(event.userId, event.recordId, tx.session);
      if (!record) return "stale";
      const current = computedMap(record); const meta = metadata(current);
      if (meta.eventIds?.includes(event.eventId)) return "duplicate";
      if (record.version !== event.sourceRecordVersion) {
        await this.enqueueFresh(tx, event, record.version, record.computationVersion ?? 0);
        return "stale";
      }
      const category = await repository.readableCategory(event.userId, record.categoryId, tx.session);
      if (!category) return "stale";
      const all = activeDefinitions(category); const derived = derivedDefinitions(category);
      if (event.sourcePropertyVersions) {
        const currentVersions = Object.fromEntries(all.filter((definition) => event.changedPropertyIds.includes(definition.id)).map((definition) => [definition.id, definition.version]));
        if (Object.entries(event.sourcePropertyVersions).some(([id, version]) => currentVersions[id] !== version)) {
          await this.enqueueFresh(tx, { ...event, sourcePropertyVersions: currentVersions }, record.version, record.computationVersion ?? 0);
          return "stale";
        }
      }
      const selected = derivedClosure(derived, event.changedPropertyIds);
      const graph = new Map(buildDependencyGraph(selected.map((definition) => ({ id: definition.id, type: definition.type, ...(definition.ast === undefined ? {} : { ast: definition.ast }), deletedAt: definition.deletedAt }))));
      for (const definition of selected) if (definition.type === "rollup") graph.set(definition.id, definition.dependencies);
      const cycleIds = new Set(detectCycles(graph).flat());
      const next = { ...current };
      const changedOutputIds: string[] = [];
      for (const definition of orderedDerived(selected)) {
        let output: CareerPropertyValueV2 | null;
        if (cycleIds.has(definition.id)) {
          output = CareerPropertyValueV2Schema.parse({ type: definition.type, value: null, diagnostics: [{ code: "cycle", message: "수식 의존성에 순환이 있습니다", severity: "error", start: 0, end: 0 }] });
        } else if (definition.type === "formula") {
          const configured = configFormula(definition);
          const diagnostics = configured.ast ? typecheckFormula(configured.ast, editorSchema(all)) : configured.diagnostics;
          if (!configured.ast || diagnostics.length) output = CareerPropertyValueV2Schema.parse({ type: "formula", value: null, diagnostics });
          else {
            const context = new Map(all.map((item) => [item.id, valueFor(record, all, item.id, next)]));
            output = parseComputed(evaluateFormula(configured.ast, context), "formula") ?? CareerPropertyValueV2Schema.parse({ type: "formula", value: null, diagnostics: [{ code: "runtime_error", message: "수식 계산에 실패했습니다", severity: "error", start: 0, end: configured.source.length }] });
          }
        } else {
          const aggregation = definition.config.aggregation;
          const relationPropertyId = definition.config.relationPropertyId;
          const targetPropertyId = definition.config.targetPropertyId;
          output = typeof aggregation === "string" && typeof relationPropertyId === "string" && typeof targetPropertyId === "string"
            ? parseComputed(await this.rollupForRecord(event.userId, record, all, relationPropertyId, targetPropertyId, aggregation, repository), "rollup")
            : CareerPropertyValueV2Schema.parse({ type: "rollup", value: null, diagnostics: [{ code: "argument_type", message: "롤업 설정이 올바르지 않습니다", severity: "error", start: 0, end: 0 }] });
        }
        if (output && canonical(next[definition.key]) !== canonical(output)) { next[definition.key] = output; changedOutputIds.push(definition.id); }
      }
      const ids = [...new Set([...(meta.eventIds ?? []), event.eventId])].slice(-20);
      next.__expressoComputation = { eventIds: ids, sourceRecordVersion: event.sourceRecordVersion };
      const updated = await repository.records().findOneAndUpdate(
        computationWriteFilter(record, event.sourceRecordVersion),
        computationWriteUpdate(next, new Date()),
        { session: tx.session, returnDocument: "after" },
      );
      if (!updated) throw new Error("Career computation CAS가 충돌했습니다");
      await this.fanout(tx, updated, category, [...new Set([...event.changedPropertyIds, ...changedOutputIds])]);
      return "applied";
    });
  }

  private async rollupForRecord(userId: string, record: CareerRecordDoc, sourceDefinitions: readonly CareerPropertyDefinitionV2[], relationPropertyId: string, targetPropertyId: string, aggregation: string, repository = this.repository): Promise<FormulaPropertyValue | null> {
    const relation = sourceDefinitions.find((definition) => definition.id === relationPropertyId && definition.type === "relation");
    if (!relation) return null;
    const edges = await repository.relations().find({ userId, sourceRecordId: record._id, sourcePropertyId: relationPropertyId }, repository.options()).limit(1_001).toArray();
    if (edges.length > 1_000) throw new Error("career rollup relation target limit exceeded");
    const targets = edges.length ? await repository.records().find({ _id: { $in: edges.map((edge) => edge.targetRecordId) }, userId, deletedAt: null }, repository.options()).limit(1_000).toArray() : [];
    const categories = new Map<string, CareerCategoryDoc>();
    for (const target of targets) if (!categories.has(target.categoryId)) {
      const category = await repository.readableCategory(userId, target.categoryId);
      if (category) categories.set(target.categoryId, category);
    }
    const values = targets.map((target) => {
      const category = categories.get(target.categoryId);
      if (!category) return null;
      const targetDefinitions = activeDefinitions(category);
      return valueFor(target, targetDefinitions, targetPropertyId, computedMap(target));
    });
    const validAggregation = ["count", "unique_count", "sum", "average", "min", "max", "earliest", "latest", "percent_checked", "show_unique"] as const;
    if (!validAggregation.includes(aggregation as typeof validAggregation[number])) return null;
    return aggregateRollup(aggregation as typeof validAggregation[number], values);
  }

  private async enqueueFresh(tx: MongoContext & { session: import("mongodb").ClientSession }, event: CareerComputationEvent, version: number, computationVersion: number): Promise<void> {
    const repository = new MongoCareerComputationRepository(tx);
    const idempotencyKey = computationFreshKey(event.recordId, version, computationVersion);
    const existing = await repository.outbox().findOne({
      userId: event.userId, topic: "career.computation", state: "pending", idempotencyKey,
    }, { session: tx.session });
    if (existing) {
      const previous = Array.isArray(existing.payload.changedPropertyIds) ? existing.payload.changedPropertyIds.filter((item): item is string => typeof item === "string") : [];
      const changedPropertyIds = [...new Set([...previous, ...event.changedPropertyIds])].sort();
      await repository.outbox().updateOne({ _id: existing._id, state: "pending" }, { $set: { "payload.changedPropertyIds": changedPropertyIds, ...(event.sourcePropertyVersions ? { "payload.sourcePropertyVersions": event.sourcePropertyVersions } : {}), updatedAt: new Date() } }, { session: tx.session });
      return;
    }
    await addMongoOutboxEvent(tx, { userId: event.userId, topic: "career.computation", idempotencyKey, payload: { userId: event.userId, recordId: event.recordId, changedPropertyIds: [...new Set(event.changedPropertyIds)].sort(), sourceRecordVersion: version, ...(event.sourcePropertyVersions ? { sourcePropertyVersions: event.sourcePropertyVersions } : {}) } });
  }

  private async fanout(tx: MongoContext & { session: import("mongodb").ClientSession }, record: CareerRecordDoc, _category: CareerCategoryDoc, changedPropertyIds: readonly string[]): Promise<void> {
    const repository = new MongoCareerComputationRepository(tx);
    const incoming = await repository.relations().find({ userId: record.userId, targetRecordId: record._id }, { session: tx.session }).limit(10_001).toArray();
    if (incoming.length > 10_000) throw new Error("career rollup fanout limit exceeded");
    for (const edge of incoming) {
      const source = await repository.activeRecord(record.userId, edge.sourceRecordId, tx.session);
      if (!source) continue;
      const category = await repository.readableCategory(record.userId, source.categoryId, tx.session);
      if (!category) continue;
      const matches = derivedDefinitions(category).some((definition) => definition.type === "rollup" && definition.config.relationPropertyId === edge.sourcePropertyId && changedPropertyIds.includes(String(definition.config.targetPropertyId)));
      if (!matches) continue;
      await addMongoOutboxEvent(tx, { userId: record.userId, topic: "career.computation", idempotencyKey: computationFanoutKey(record._id, edge.sourceRecordId, record.version, record.computationVersion ?? 0), payload: { userId: record.userId, recordId: source._id, changedPropertyIds: [edge.sourcePropertyId], sourceRecordVersion: source.version } });
    }
  }
}

export function resolveComputationValue(
  category: CareerCategoryDoc,
  record: Pick<CareerRecordDoc, "properties" | "propertyValues">,
  propertyId: string,
  computed: Record<string, unknown>,
): FormulaPropertyValue | null {
  const all = activeDefinitions(category);
  const definition = all.find((item) => item.id === propertyId);
  if (!definition) return null;
  if (definition.type === "formula" || definition.type === "rollup") {
    return asValue(computed[definition.key], definition);
  }
  if (record.propertyValues === undefined) return asValue(record.properties[definition.key], definition);
  if (!Array.isArray(record.propertyValues)) throw new Error("canonical propertyValues 저장 shape가 올바르지 않습니다");
  const byId = new Map(all.map((item) => [item.id, item]));
  const seen = new Set<string>();
  let resolved: FormulaPropertyValue | null = null;
  for (const raw of record.propertyValues) {
    if (!raw || typeof raw !== "object" || typeof raw.propertyDefinitionId !== "string") {
      throw new Error("canonical PropertyValue shape가 올바르지 않습니다");
    }
    if (seen.has(raw.propertyDefinitionId)) throw new Error("canonical PropertyValue identity가 중복되었습니다");
    seen.add(raw.propertyDefinitionId);
    const owner = byId.get(raw.propertyDefinitionId);
    if (!owner || owner.type !== raw.type) throw new Error("canonical PropertyValue가 Definition과 일치하지 않습니다");
    const candidate = raw.type === "number"
      ? { ...raw, value: raw.value instanceof Decimal128 ? raw.value.toString() : String(raw.value) }
      : raw;
    const parsed = WritableCareerPropertyValueSchema.safeParse(candidate);
    if (!parsed.success) throw new Error("canonical PropertyValue shape가 올바르지 않습니다");
    if (raw.propertyDefinitionId !== propertyId) continue;
    if (parsed.data.type === "number") resolved = { type: "number", value: Number(parsed.data.value) };
    else if (parsed.data.type === "date") resolved = { type: "date", value: {
      start: parsed.data.value.start, end: parsed.data.value.end,
      timezone: parsed.data.value.precision === "datetime" ? parsed.data.value.timezone : null,
    } };
    else resolved = { type: parsed.data.type, value: parsed.data.value } as FormulaPropertyValue;
  }
  return resolved;
}

export function computationWriteFilter(record: Pick<CareerRecordDoc, "_id" | "userId" | "computationVersion">, sourceRecordVersion: number): Filter<CareerRecordDoc> {
  const computationVersion = record.computationVersion ?? 0;
  return {
    _id: record._id, userId: record.userId, deletedAt: null, version: sourceRecordVersion,
    ...(computationVersion === 0
      ? { $or: [{ computationVersion: 0 }, { computationVersion: { $exists: false } }] }
      : { computationVersion }),
  };
}

export function computationWriteUpdate(computedProperties: Document, computedAt: Date): UpdateFilter<CareerRecordDoc> {
  return { $set: { computedProperties: computedProperties as never, computedAt }, $inc: { computationVersion: 1 } };
}

export function computationFreshKey(recordId: string, version: number, computationVersion: number): string {
  return `career-computation-fresh:${recordId}:v${version}:c${computationVersion}`;
}

export function computationFanoutKey(recordId: string, sourceRecordId: string, version: number, computationVersion: number): string {
  return `career-computation-fanout:${recordId}:${sourceRecordId}:v${version}:c${computationVersion}`;
}
