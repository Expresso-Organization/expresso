import { createHash } from "node:crypto";
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
import type { CareerCategoryDoc, CareerRecordDoc, CareerRecordRelationDoc } from "@expresso/database";
import { readCanonicalCareerPropertyValues } from "@expresso/database";

import { addMongoOutboxEvent } from "../../platform/mongo-outbox.js";
import { inTransaction } from "../../platform/mongo-transaction.js";
import type { MongoContext } from "../../platform/mongodb.js";
import { MongoCareerComputationRepository } from "./repository.js";
import { CanonicalCareerReadService,canonicalRecordReadDefinitions,CareerError } from "../career/index.js";

export interface CareerComputationEvent {
  eventId: string;
  userId: string;
  recordId: string;
  changedPropertyIds: readonly string[];
  sourceRecordVersion: number;
  sourcePropertyVersions?: Readonly<Record<string, number>>;
  sourceSchemaVersion?: number;
  sourceCategoryVersion?: number;
  sourceSchemaFingerprint?: string;
  refreshCause?: string;
}
export interface CareerComputationService {
  recompute(event: CareerComputationEvent): Promise<"applied" | "stale" | "duplicate">;
  previewFormula(userId: string, input: PreviewCareerFormula): Promise<CareerFormulaPreview>;
  previewRollup(userId: string, input: PreviewCareerRollup): Promise<CareerRollupPreview>;
}
export interface CareerComputationApi extends CareerComputationService {}
export interface CareerComputationTargetStateService {
  invalidateTargetState(userId:string,targetRecordId:string,targetRecordVersion:number):Promise<void>;
}

interface ComputationMetadata { readonly eventIds?: readonly string[]; readonly sourceRecordVersion?: number }
interface DerivedDefinition extends CareerPropertyDefinitionV2 { readonly ast?: FormulaAst | null; readonly dependencies: readonly string[] }
class PendingRelationProjection extends Error {
  readonly statusCode=409;
  constructor() {super("CAREER_RELATION_PROJECTION_PENDING");}
}
class ProjectionDependencyChanged extends Error {
  constructor(readonly causeFingerprint:string) {super("rollup dependency changed");}
}
function schemaBinding(category:CareerCategoryDoc) {
  return {sourceSchemaVersion:category.schemaVersion??category.version,sourceCategoryVersion:category.version,sourceSchemaFingerprint:createHash("sha256").update(JSON.stringify(definitions(category))).digest("hex")};
}
function targetState(record:CareerRecordDoc) {
  return JSON.stringify([record._id,record.version,record.deletedAt,record.categoryId,record.computationVersion??0]);
}

function definitions(category: CareerCategoryDoc): CareerPropertyDefinitionV2[] {
  return category.propertySchemaV2 ?? Object.entries(category.propertySchema).map(([key, property], order) => ({
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
function valueFor(record: CareerRecordDoc, definitions_: readonly CareerPropertyDefinitionV2[], propertyId: string, computed: Record<string, unknown>, mode: "legacy" | "canonical"): FormulaPropertyValue | null {
  const definition = definitions_.find((item) => item.id === propertyId);
  if (!definition) return null;
  if(mode==="canonical") {
    if(definition.type==="formula" || definition.type==="rollup")return asValue(computed[definition.key],definition);
    if(definition.system && (definition.type==="created_time" || definition.type==="updated_time")) {
      const timestamp=definition.type==="updated_time"?record.updatedAt:record.createdAt;
      return timestamp?{type:definition.type,value:timestamp.toISOString()}:null;
    }
    if(definition.type==="relation")return null;
    if(definition.type==="title")return {type:"title",value:record.title};
    const value=readCanonicalCareerPropertyValues(record).find(v=>v.propertyDefinitionId===propertyId);
    if(!value)return null;
    if(definition.type==="created_time" || definition.type==="updated_time") return value.type==="date" && value.value.precision==="datetime" && value.value.end===null?{type:definition.type,value:value.value.start}:null;
    // 수식 엔진의 number는 derived 계산 전용이며 canonical 값으로 저장하지 않습니다.
    if(value.type==="number") {const numeric=Number(value.value);if(!Number.isFinite(numeric))throw new Error("canonical decimal exceeds computation numeric range");return {type:"number",value:numeric};}
    if(value.type==="multi_select" && definition.config.legacyFreeformTags===true) {
      const options=Array.isArray(definition.config.options)?definition.config.options as {id:string;label?:string;name?:string}[]:[];
      const labels=value.value.map(id=>{const option=options.find(item=>item.id===id),label=option?.label??option?.name;if(typeof label!=="string")throw new CareerError(409,"CANONICAL_OPTION_LABEL_UNAVAILABLE");return label;});
      return {type:"multi_select",value:labels};
    }
    return {type:value.type,value:value.value};
  }
  return asValue(record.properties[definition.key] ?? computed[definition.key], definition);
}
function parseComputed(value: FormulaPropertyValue | null, type: "formula" | "rollup"): CareerPropertyValueV2 | null {
  if (!value) return null;
  const parsed = CareerPropertyValueV2Schema.safeParse({ ...value, type });
  return parsed.success ? parsed.data : null;
}

/** Canonical 기간은 offset과 precision을 비교하되 원문 값을 그대로 projection에 남깁니다. */
function canonicalTemporalRollup(kind:"earliest"|"latest",values:readonly (FormulaPropertyValue|null)[]):FormulaPropertyValue {
 const dates=values.flatMap(value=>{
  if(!value)return [];
  const raw=value.type==="date"&&value.value&&typeof value.value==="object"&&!Array.isArray(value.value)&&"start" in value.value?value.value.start:value.value;
  return raw===null||raw===undefined||raw===""?[]:[raw];
 });
 const ticks=(raw:unknown):bigint|null=>{
  if(typeof raw!=="string")return null;
  const normalized=/^\d{4}-\d{2}$/.test(raw)?`${raw}-01T00:00:00Z`:/^\d{4}-\d{2}-\d{2}$/.test(raw)?`${raw}T00:00:00Z`:raw;
  const fraction=/\.([0-9]{1,9})(?=Z|[+-])/.exec(normalized)?.[1]??"";
  const seconds=Date.parse(normalized.replace(/\.[0-9]+(?=Z|[+-])/u,""))/1000;
  return Number.isFinite(seconds)?BigInt(seconds)*1_000_000_000n+BigInt(fraction.padEnd(9,"0")):null;
 };
 const parsed=dates.map(raw=>({raw,ticks:ticks(raw)}));
 if(!parsed.length||parsed.some(value=>value.ticks===null))return {type:"rollup",value:null,diagnostics:[]};
 parsed.sort((a,b)=>a.ticks!<b.ticks!?-1:a.ticks!>b.ticks!?1:0);
 return {type:"rollup",value:(kind==="earliest"?parsed[0]!:parsed.at(-1)!).raw,diagnostics:[]};
}
const MAX_RELATION_FANOUT = 10_000;
function relationFanoutSources(edges:readonly CareerRecordRelationDoc[],targetRecordId:string,errorMessage:string):Map<string,Set<string>> {
  // 정방향과 역방향의 물리 mirror 두 행은 같은 논리 연결 하나로 계산합니다.
  if(edges.length>MAX_RELATION_FANOUT*2)throw new Error(errorMessage);
  const sources=new Map<string,Set<string>>(),connections=new Set<string>();
  for(const edge of edges){
    const incoming=edge.targetRecordId===targetRecordId;
    const recordId=incoming?edge.sourceRecordId:edge.targetRecordId,propertyId=incoming?edge.sourcePropertyId:edge.inversePropertyId;
    if(!propertyId)continue;
    connections.add(JSON.stringify([recordId,propertyId,incoming?edge.inversePropertyId:edge.sourcePropertyId]));
    if(connections.size>MAX_RELATION_FANOUT)throw new Error(errorMessage);
    const ids=sources.get(recordId)??new Set<string>();ids.add(propertyId);sources.set(recordId,ids);
  }
  return sources;
}
export class MongoCareerComputationService implements CareerComputationService {
  readonly repository: MongoCareerComputationRepository;
  constructor(readonly context: MongoContext,readonly inputMode:"legacy"|"canonical"="legacy") { this.repository = new MongoCareerComputationRepository(context); }

  private async readDefinitions(userId:string,category:CareerCategoryDoc,record?:CareerRecordDoc,repository=this.repository):Promise<CareerPropertyDefinitionV2[]> {
    if(this.inputMode!=="canonical")return activeDefinitions(category);
    const state=await new CanonicalCareerReadService(repository.context).viewReadContext(userId,category,repository.options().session);
    const definitions_=record?canonicalRecordReadDefinitions(state.definitions,readCanonicalCareerPropertyValues(record),state.source):state.definitions;
    return definitions_.filter(definition=>definition.deletedAt===null);
  }

  /** Lifecycle 이벤트를 소비해 관련 canonical projection의 갱신을 durable outbox에 발행합니다. */
  async invalidateTargetState(userId:string,targetRecordId:string,targetRecordVersion:number):Promise<void> {
    if(this.inputMode!=="canonical")throw new Error("target-state invalidation requires canonical computation");
    if(!Number.isSafeInteger(targetRecordVersion) || targetRecordVersion<1)throw new Error("target-state version is invalid");
    await inTransaction(this.context,async tx=>{
      const repository=new MongoCareerComputationRepository(tx);
      const target=await repository.records().findOne({_id:targetRecordId,userId},{session:tx.session});
      if(target && target.version<targetRecordVersion)throw new Error("target-state event is ahead of canonical record");
      const incoming=await repository.relations().find({userId,$or:[{targetRecordId},{sourceRecordId:targetRecordId,inversePropertyId:{$type:"string"}}]},{session:tx.session}).limit(MAX_RELATION_FANOUT*2+1).toArray();
      const sources=relationFanoutSources(incoming,targetRecordId,"career lifecycle fanout limit exceeded");
      if(target)await this.guardProjectionTarget(repository,target);
      const refreshCause=target?`target:${targetRecordId}:v${target.version}`:`target:${targetRecordId}:missing:v${targetRecordVersion}`;
      for(const [recordId,relations] of sources) {
        const source=await repository.activeRecord(userId,recordId,tx.session);
        const category=source?await repository.readableCategory(userId,source.categoryId,tx.session):null;
        if(!source || !category || !derivedDefinitions(category).some(d=>d.type==="rollup" && relations.has(String(d.config.relationPropertyId))))continue;
        await this.guardProjectionCategory(repository,category);
        await this.enqueueFresh(tx,{eventId:refreshCause,userId,recordId,changedPropertyIds:[...relations],sourceRecordVersion:source.version,refreshCause},source.version);
      }
    });
  }

  async previewFormula(userId: string, raw: PreviewCareerFormula): Promise<CareerFormulaPreview> {
    const input = PreviewCareerFormulaSchema.parse(raw);
    const category = await this.repository.readableCategory(userId, input.categoryId);
    if (!category) throw new Error("career category not found");
    let record=this.inputMode==="canonical" && input.recordId?await this.repository.activeRecord(userId,input.recordId):null;
    if(this.inputMode==="canonical" && input.recordId && (!record || record.categoryId!==input.categoryId))throw new Error("career record not found");
    const all = await this.readDefinitions(userId,category,record??undefined);
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
      record??=await this.repository.activeRecord(userId,input.recordId);
      if(!record || record.categoryId!==input.categoryId)throw new Error("career record not found");
      const evaluatedRecord=record,computed = computedMap(evaluatedRecord);
      const context = new Map(all.map((definition) => [definition.id, valueFor(evaluatedRecord, all, definition.id, computed,this.inputMode)]));
      value = parseComputed(evaluateFormula(ast, context), "formula");
    }
    return CareerFormulaPreviewSchema.parse({ source: input.source, ast, diagnostics, value, dependencies });
  }

  async previewRollup(userId: string, raw: PreviewCareerRollup): Promise<CareerRollupPreview> {
    const input = PreviewCareerRollupSchema.parse(raw);
    const category = await this.repository.readableCategory(userId, input.categoryId);
    if (!category) throw new Error("career category not found");
    if(this.inputMode==="canonical") {
      const policy=await new CanonicalCareerReadService(this.context).viewReadContext(userId,category);
      if(policy.blockedRelationIds.includes(input.relationPropertyId))throw new PendingRelationProjection();
    }
    const all = await this.readDefinitions(userId,category);
    const relation = all.find((definition) => definition.id === input.relationPropertyId && definition.type === "relation");
    const targetCategoryId = relation?.config.targetCategoryId;
    const targetCategory = typeof targetCategoryId === "string" ? await this.repository.readableCategory(userId, targetCategoryId) : null;
    const target = targetCategory ? (await this.readDefinitions(userId,targetCategory)).find((definition) => definition.id === input.targetPropertyId) : undefined;
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
    try {return await inTransaction(this.context, async (tx) => {
      const repository = new MongoCareerComputationRepository(tx);
      const record = await repository.activeRecord(event.userId, event.recordId, tx.session);
      if (!record) return "stale";
      const current = computedMap(record); const meta = metadata(current);
      if (meta.eventIds?.includes(event.eventId)) return "duplicate";
      if (record.version !== event.sourceRecordVersion) {
        await this.enqueueFresh(tx, event, record.version);
        return "stale" as const;
      }
      const category = await repository.readableCategory(event.userId, record.categoryId, tx.session);
      if (!category) return "stale";
      if(this.inputMode==="canonical") {
        const binding=schemaBinding(category);
        if((event.sourceSchemaVersion!==undefined && event.sourceSchemaVersion!==binding.sourceSchemaVersion) || (event.sourceCategoryVersion!==undefined && event.sourceCategoryVersion!==binding.sourceCategoryVersion) || (event.sourceSchemaFingerprint!==undefined && event.sourceSchemaFingerprint!==binding.sourceSchemaFingerprint)) {
          await this.enqueueFresh(tx,event,record.version);return "stale";
        }
      }
      const all = await this.readDefinitions(event.userId,category,record,repository); const derived = derivedDefinitions(category);
      if (event.sourcePropertyVersions) {
        const currentVersions = Object.fromEntries((this.inputMode==="canonical"?definitions(category):all).filter((definition) => event.changedPropertyIds.includes(definition.id)).map((definition) => [definition.id, definition.version]));
        if (Object.entries(event.sourcePropertyVersions).some(([id, version]) => currentVersions[id] !== version)) {
          await this.enqueueFresh(tx, { ...event, sourcePropertyVersions: currentVersions }, record.version);
          return "stale";
        }
      }
      const selected = derivedClosure(derived, event.changedPropertyIds);
      const graph = new Map(buildDependencyGraph(selected.map((definition) => ({ id: definition.id, type: definition.type, ...(definition.ast === undefined ? {} : { ast: definition.ast }), deletedAt: definition.deletedAt }))));
      for (const definition of selected) if (definition.type === "rollup") graph.set(definition.id, definition.dependencies);
      const cycleIds = new Set(detectCycles(graph).flat());
      const next = { ...current };
      const dependencyTargets=new Map<string,CareerRecordDoc>();
      const changedOutputIds: string[] = [];
      if(this.inputMode==="canonical")for(const definition of definitions(category)) {
        if(definition.deletedAt!==null && ["formula","rollup"].includes(definition.type) && Object.hasOwn(next,definition.key)) {delete next[definition.key];changedOutputIds.push(definition.id);}
      }
      for (const definition of orderedDerived(selected)) {
        let output: CareerPropertyValueV2 | null;
        if (cycleIds.has(definition.id)) {
          output = CareerPropertyValueV2Schema.parse({ type: definition.type, value: null, diagnostics: [{ code: "cycle", message: "수식 의존성에 순환이 있습니다", severity: "error", start: 0, end: 0 }] });
        } else if (definition.type === "formula") {
          const configured = configFormula(definition);
          const diagnostics = configured.ast ? typecheckFormula(configured.ast, editorSchema(all)) : configured.diagnostics;
          if (!configured.ast || diagnostics.length) output = CareerPropertyValueV2Schema.parse({ type: "formula", value: null, diagnostics });
          else {
            const context = new Map(all.map((item) => [item.id, valueFor(record, all, item.id, next,this.inputMode)]));
            output = parseComputed(evaluateFormula(configured.ast, context), "formula") ?? CareerPropertyValueV2Schema.parse({ type: "formula", value: null, diagnostics: [{ code: "runtime_error", message: "수식 계산에 실패했습니다", severity: "error", start: 0, end: configured.source.length }] });
          }
        } else {
          const aggregation = definition.config.aggregation;
          const relationPropertyId = definition.config.relationPropertyId;
          const targetPropertyId = definition.config.targetPropertyId;
          output = typeof aggregation === "string" && typeof relationPropertyId === "string" && typeof targetPropertyId === "string"
            ? parseComputed(await this.rollupForRecord(event.userId, record, all, relationPropertyId, targetPropertyId, aggregation, repository,dependencyTargets), "rollup")
            : CareerPropertyValueV2Schema.parse({ type: "rollup", value: null, diagnostics: [{ code: "argument_type", message: "롤업 설정이 올바르지 않습니다", severity: "error", start: 0, end: 0 }] });
        }
        if (output && canonical(next[definition.key]) !== canonical(output)) { next[definition.key] = output; changedOutputIds.push(definition.id); }
        else if(this.inputMode==="canonical" && output===null && Object.hasOwn(next,definition.key)) {delete next[definition.key];changedOutputIds.push(definition.id);}
      }
      const ids = [...new Set([...(meta.eventIds ?? []), event.eventId])].slice(-20);
      next.__expressoComputation = { eventIds: ids, sourceRecordVersion: event.sourceRecordVersion };
      if(this.inputMode==="canonical") {
        for(const target of dependencyTargets.values())if(target._id!==record._id)await this.guardProjectionTarget(repository,target);
        await this.guardProjectionCategory(repository,category);
      }
      const projectionVersion=record.computationVersion??0;
      if(this.inputMode==="canonical" && (!Number.isSafeInteger(projectionVersion) || projectionVersion>=Number.MAX_SAFE_INTEGER))throw new Error("computation version exhausted");
      const filter={_id:record._id,userId:event.userId,deletedAt:null,version:event.sourceRecordVersion,...(this.inputMode==="canonical"?{computationVersion:record.computationVersion??{$exists:false}}:{})};
      const update=this.inputMode==="canonical"?{$set:{computedProperties:next as never,computedAt:new Date(),computationVersion:projectionVersion+1}}:{$set:{computedProperties:next as never,updatedAt:new Date()},$inc:{version:1}};
      const updated = await repository.records().findOneAndUpdate(filter,update,{session:tx.session,returnDocument:"after"});
      if (!updated) { await this.enqueueFresh(tx, event, record.version); return "stale"; }
      await this.fanout(tx, updated, category, [...new Set([...event.changedPropertyIds, ...changedOutputIds])]);
      return "applied";
    });}catch(error) {
      if(error instanceof PendingRelationProjection)return "stale";
      if(!(error instanceof ProjectionDependencyChanged))throw error;
      return inTransaction(this.context,async tx=>{
        const record=await new MongoCareerComputationRepository(tx).activeRecord(event.userId,event.recordId,tx.session);
        if(record)await this.enqueueFresh(tx,{...event,refreshCause:error.causeFingerprint},record.version);
        return "stale" as const;
      });
    }
  }

  private async rollupForRecord(userId: string, record: CareerRecordDoc, sourceDefinitions: readonly CareerPropertyDefinitionV2[], relationPropertyId: string, targetPropertyId: string, aggregation: string, repository = this.repository,observedTargets?:Map<string,CareerRecordDoc>): Promise<FormulaPropertyValue | null> {
    const relation = sourceDefinitions.find((definition) => definition.id === relationPropertyId && definition.type === "relation");

    const edges = await repository.relations().find(this.inputMode==="canonical"?{userId,$or:[{sourceRecordId:record._id,sourcePropertyId:relationPropertyId},{targetRecordId:record._id,inversePropertyId:relationPropertyId}]}:{userId,sourceRecordId:record._id,sourcePropertyId:relationPropertyId}, repository.options()).limit(this.inputMode==="canonical"?2_001:1_001).toArray();
    if (edges.length > (this.inputMode==="canonical"?2_000:1_000)) throw new Error("career rollup relation target limit exceeded");
    let visibleIds:Set<string>|undefined;
    if(this.inputMode==="canonical") {
      const projection=await new CanonicalCareerReadService(repository.context).relationProjection(record,sourceDefinitions,repository.options().session);
      if(projection.blockedPropertyIds.includes(relationPropertyId))throw new PendingRelationProjection();
      visibleIds=new Set((relation?projection.properties[relation.key]:undefined)?.value.map(target=>target.recordId)??[]);
    }
    if (!relation) return null;
    // 숨겨진 삭제 대상도 관찰해 lifecycle 변경과 projection commit을 직렬화합니다.
    const targetIds=[...new Set([...edges.map(edge=>edge.sourceRecordId===record._id?edge.targetRecordId:edge.sourceRecordId),...(visibleIds??[])])];
    if(targetIds.length>1_000)throw new Error("career rollup relation target limit exceeded");
    const targets = targetIds.length ? await repository.records().find({ _id: { $in: targetIds }, userId,...(this.inputMode==="canonical"?{}:{deletedAt:null}) }, repository.options()).limit(1_000).toArray() : [];
    targets.forEach(target=>observedTargets?.set(target._id,target));
    const categories = new Map<string, CareerCategoryDoc>();
    for (const target of targets) if (!categories.has(target.categoryId)) {
      const category = await repository.readableCategory(userId, target.categoryId,this.inputMode==="canonical"?repository.options().session:undefined);
      if (category) {categories.set(target.categoryId,category);if(this.inputMode==="canonical" && repository.options().session)await this.guardProjectionCategory(repository,category);}
    }
    const values:(FormulaPropertyValue|null)[]=[];
    for(const target of targets.filter(target=>target.deletedAt==null && (!visibleIds || visibleIds.has(target._id)))) {
      const category=categories.get(target.categoryId);
      if(!category){values.push(null);continue;}
      const targetDefinitions=await this.readDefinitions(userId,category,target,repository);
      values.push(valueFor(target,targetDefinitions,targetPropertyId,computedMap(target),this.inputMode));
    }
    const validAggregation = ["count", "unique_count", "sum", "average", "min", "max", "earliest", "latest", "percent_checked", "show_unique"] as const;
    if (!validAggregation.includes(aggregation as typeof validAggregation[number])) return null;
    if(this.inputMode==="canonical" && (aggregation==="earliest" || aggregation==="latest"))return canonicalTemporalRollup(aggregation,values);
    return aggregateRollup(aggregation as typeof validAggregation[number], values);
  }

  private async guardProjectionCategory(repository:MongoCareerComputationRepository,category:CareerCategoryDoc):Promise<void> {
    const result=await repository.categories().updateOne({_id:category._id,version:category.version,deletedAt:null,...(category.schemaVersion===undefined?{schemaVersion:{$exists:false}}:{schemaVersion:category.schemaVersion})},{$inc:{writeVersion:1}},repository.options());
    if(result.matchedCount!==1)throw new Error("projection schema changed");
  }

  private async guardProjectionTarget(repository:MongoCareerComputationRepository,target:CareerRecordDoc):Promise<void> {
    const latest=await this.repository.records().findOne({_id:target._id,userId:target.userId});
    if(!latest || targetState(latest)!==targetState(target))throw new ProjectionDependencyChanged(createHash("sha256").update(latest?targetState(latest):`${target._id}:missing`).digest("hex"));
    const revision=target.computationVersion??0;
    if(!Number.isSafeInteger(revision) || revision>=Number.MAX_SAFE_INTEGER)throw new Error("computation version exhausted");
    // 실제 projection metadata 쓰기로 transaction snapshot과 lifecycle writer를 직렬화합니다.
    const guarded=await repository.records().updateOne({_id:target._id,userId:target.userId,version:target.version,categoryId:target.categoryId,deletedAt:target.deletedAt??null,computationVersion:target.computationVersion??{$exists:false}},{$set:{computationVersion:revision+1}},repository.options());
    if(guarded.matchedCount!==1)throw new ProjectionDependencyChanged(createHash("sha256").update(targetState(target)).digest("hex"));
  }

  private async enqueueFresh(tx: MongoContext & { session: import("mongodb").ClientSession }, event: CareerComputationEvent, version: number): Promise<void> {
    const repository = new MongoCareerComputationRepository(tx);
    if(this.inputMode==="canonical") {
      const record=await repository.activeRecord(event.userId,event.recordId,tx.session);
      const category=record?await repository.readableCategory(event.userId,record.categoryId,tx.session):null;
      if(!category)return;
      const binding=schemaBinding(category),all=definitions(category);
      const payload={userId:event.userId,recordId:event.recordId,changedPropertyIds:all.map(d=>d.id).sort(),sourceRecordVersion:version,sourcePropertyVersions:Object.fromEntries(all.map(d=>[d.id,d.version]).sort(([a],[b])=>String(a).localeCompare(String(b)))),...binding,...(event.refreshCause?{refreshCause:event.refreshCause}:{})};
      await addMongoOutboxEvent(tx,{userId:event.userId,topic:"career.computation",idempotencyKey:`career-computation-fresh:${event.recordId}:v${version}:s${binding.sourceSchemaVersion}:c${binding.sourceCategoryVersion}:f${binding.sourceSchemaFingerprint}:d${event.refreshCause??"none"}`,payload});
      return;
    }
    const existing = await repository.outbox().findOne({
      userId: event.userId, topic: "career.computation", state: "pending",
      "payload.recordId": event.recordId, "payload.sourceRecordVersion": version,
    }, { session: tx.session });
    if (existing) {
      const previous = Array.isArray(existing.payload.changedPropertyIds) ? existing.payload.changedPropertyIds.filter((item): item is string => typeof item === "string") : [];
      const changedPropertyIds = [...new Set([...previous, ...event.changedPropertyIds])].sort();
      await repository.outbox().updateOne({ _id: existing._id, state: "pending" }, { $set: { "payload.changedPropertyIds": changedPropertyIds, ...(event.sourcePropertyVersions ? { "payload.sourcePropertyVersions": event.sourcePropertyVersions } : {}), updatedAt: new Date() } }, { session: tx.session });
      return;
    }
    await addMongoOutboxEvent(tx, { userId: event.userId, topic: "career.computation", idempotencyKey: `career-computation-fresh:${event.recordId}:v${version}`, payload: { userId: event.userId, recordId: event.recordId, changedPropertyIds: [...new Set(event.changedPropertyIds)].sort(), sourceRecordVersion: version, ...(event.sourcePropertyVersions ? { sourcePropertyVersions: event.sourcePropertyVersions } : {}) } });
  }

  private async fanout(tx: MongoContext & { session: import("mongodb").ClientSession }, record: CareerRecordDoc, _category: CareerCategoryDoc, changedPropertyIds: readonly string[]): Promise<void> {
    const repository = new MongoCareerComputationRepository(tx);
    const incoming = await repository.relations().find(this.inputMode==="canonical"?{userId:record.userId,$or:[{targetRecordId:record._id},{sourceRecordId:record._id,inversePropertyId:{$type:"string"}}]}:{userId:record.userId,targetRecordId:record._id}, { session: tx.session }).limit(MAX_RELATION_FANOUT*(this.inputMode==="canonical"?2:1)+1).toArray();
    if (this.inputMode==="legacy" && incoming.length > MAX_RELATION_FANOUT) throw new Error("career rollup fanout limit exceeded");
    const sources=relationFanoutSources(incoming,record._id,"career rollup fanout limit exceeded");
    for (const [recordId,relations] of sources) {
      const source = await repository.activeRecord(record.userId, recordId, tx.session);
      if (!source) continue;
      const category = await repository.readableCategory(record.userId, source.categoryId, tx.session);
      if (!category) continue;
      const matches=[...new Set(derivedDefinitions(category).filter(definition=>definition.type==="rollup" && relations.has(String(definition.config.relationPropertyId)) && changedPropertyIds.includes(String(definition.config.targetPropertyId))).map(definition=>String(definition.config.relationPropertyId)))].sort();
      if (!matches.length) continue;
      await addMongoOutboxEvent(tx, { userId: record.userId, topic: "career.computation", idempotencyKey: `career-computation-fanout:${record._id}:${source._id}:v${record.version}${this.inputMode==="canonical"?`:c${record.computationVersion}`:""}`, payload: { userId: record.userId, recordId: source._id, changedPropertyIds: matches, sourceRecordVersion: source.version } });
    }
  }
}
