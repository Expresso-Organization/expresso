import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { UuidSchema, CareerRegisterPropertyOptionSchema, CareerPropertyOptionResponseSchema, type CareerRegisterPropertyOption, ApplyCareerPropertyChangeSchema, CareerBusinessPropertyValueSchema, CareerPropertyChangePreviewSchema,
  CareerPropertyDefinitionV2Schema, CareerPropertyMutationJobPlanSchema, CareerPropertySchemaChangeSchema,
  type ApplyCareerPropertyChange, type CareerPropertyDefinitionV2, type CareerPropertyMutationPlan, type CareerPropertySchemaChange } from "@expresso/contracts";
import { mongoCollections, registerCareerPropertyOption, readCareerCategoryPropertyOptions, prepareCareerPropertyOptionSnapshot, readCareerPropertyOptionSnapshot, overlayCareerPropertyOptions, type CareerPropertyOptionDoc, type CareerPropertyOptionPolicy, type CareerPropertyOptionSnapshot, readCanonicalCareerPropertyValues, type CareerCategoryDoc, type CareerPropertyMutationDoc, type CareerRecordDoc } from "@expresso/database";
import type { Filter } from "mongodb";
import type { MongoContext } from "../../platform/mongodb.js";
import { inTransaction } from "../../platform/mongo-transaction.js";
import { addMongoOutboxEvent } from "../../platform/mongo-outbox.js";
import { requireActiveUser } from "../identity/index.js";
import { CareerError } from "./errors.js";
import { mapMongoCategory } from "./mongo-categories.js";
import { validateCareerPropertyConfiguration } from "./property-schema.js";
import { canonicalDecimal, convertCanonicalPropertyValue } from "./canonical-property-mutation-values.js";
import { mutationCanonicalJson, mutationFingerprint, mutationJobPlan } from "./property-mutation-state.js";
import { assertCanonicalMutationValue, effectiveCanonicalMutationOperation } from "./canonical-property-mutation-policy.js";

const WRITABLE=new Set(["text","number","select","multi_select","date","checkbox","url","email","phone","file","media"]);
const LIMIT=10_000;
function containsReference(value: unknown,id: string): boolean {return value===id || (Array.isArray(value)?value.some(item=>containsReference(item,id)):Boolean(value && typeof value==="object" && Object.values(value).some(item=>containsReference(item,id))));}
function definitions(category: CareerCategoryDoc) {
  if(!Array.isArray(category.propertySchemaV2) || !Number.isSafeInteger(category.schemaVersion) || category.schemaVersion!<1)throw new CareerError(409,"CANONICAL_SCHEMA_NOT_PREPARED");
  const parsed=category.propertySchemaV2.map(value=>CareerPropertyDefinitionV2Schema.parse(value));
  const ids=new Set<string>(),keys=new Set<string>();
  // 삭제된 정의의 ID와 key도 예약하며 표시 이름은 중복을 허용합니다.
  for(const definition of parsed) {
    if(ids.has(definition.id)||keys.has(definition.key))throw new CareerError(409,"DUPLICATE_CANONICAL_DEFINITION");
    ids.add(definition.id);keys.add(definition.key);
  }
  return parsed;
}
const customTimestamp=(definition:CareerPropertyDefinitionV2)=>!definition.system && ["created_time","updated_time"].includes(definition.type);
function nextVersion(version: number): number {if(!Number.isSafeInteger(version) || version<1 || version===Number.MAX_SAFE_INTEGER) throw new CareerError(409,"schema version exhausted");return version+1;}
function defaultValue(definition: CareerPropertyDefinitionV2) {
  const raw=definition.config.defaultValue;
  if(raw===undefined) return null;
  const candidate=raw as {type?:unknown;value?:unknown;propertyDefinitionId?:unknown};
  const effective:CareerPropertyDefinitionV2=customTimestamp(definition)?{...definition,type:"date"}:definition;
  if(!candidate || candidate.type!==effective.type || (!WRITABLE.has(definition.type) && !customTimestamp(definition))) throw new CareerError(400,"property default value does not match its type");
  let value=candidate.value;
  if(definition.type==="number" && (typeof value==="number" || typeof value==="string")) value=canonicalDecimal(String(value));
  if(effective.type==="date" && value && typeof value==="object" && !("precision" in value)) {
    const date=value as {start:string;end:unknown;timezone:unknown};
    const precision=date.start.includes("T")?"datetime":date.start.length===7?"month":"day";
    if(precision!=="datetime" && date.timezone!==null) throw new CareerError(400,"date-only default cannot carry a timezone");
    value={precision,start:date.start,end:date.end,...(precision==="datetime"?{timezone:date.timezone}:{})};
  }
  const parsed=CareerBusinessPropertyValueSchema.safeParse({propertyDefinitionId:candidate.propertyDefinitionId??definition.id,type:candidate.type,value});
  if(!parsed.success || parsed.data.propertyDefinitionId!==definition.id) throw new CareerError(400,"canonical default is invalid");
  if(customTimestamp(definition) && (parsed.data.type!=="date" || parsed.data.value.precision!=="datetime" || parsed.data.value.end!==null))throw new CareerError(400,"custom timestamp default must be one datetime");
  const converted=convertCanonicalPropertyValue(parsed.data,effective);
  if(converted.kind!=="exact") throw new CareerError(400,"default option IDs are invalid");
  return parsed.data;
}
function validateCanonicalConfiguration(type:CareerPropertyDefinitionV2["type"],config:Record<string,unknown>):void {
  if(type!=="select" && type!=="multi_select"){validateCareerPropertyConfiguration(type,config);return;}
  if(!Array.isArray(config.options))throw new CareerError(400,"select properties require options");
  const ids=new Set<string>(),labels=new Set<string>();
  const normalized=config.options.map(raw=>{
    if(!raw || typeof raw!=="object" || Array.isArray(raw))throw new CareerError(400,"property option is invalid");
    const option=raw as Record<string,unknown>,label=option.label??option.name;
    if(!UuidSchema.safeParse(option.id).success || typeof label!=="string" || (option.label!==undefined && typeof option.label!=="string") || (option.name!==undefined && typeof option.name!=="string") || (typeof option.label==="string" && typeof option.name==="string" && option.label!==option.name) || (config.legacyFreeformTags===true?label.length>200:!label.trim()))throw new CareerError(400,"property option is invalid");
    const id=option.id as string;
    if(ids.has(id) || (config.legacyFreeformTags===true && labels.has(label)))throw new CareerError(400,"property option mapping is ambiguous");
    ids.add(id);labels.add(label);return {...option,name:label};
  });
  if(config.legacyFreeformTags!==true)validateCareerPropertyConfiguration(type,{...config,options:normalized});
}
function prepare(category: CareerCategoryDoc,change: CareerPropertySchemaChange,now: Date) {
  const next=structuredClone(definitions(category));let operation: CareerPropertyMutationPlan|null=null;const recomputePropertyIds:string[]=[];
  if(change.kind==="create") {
    if(change.property.system) throw new CareerError(403,"system properties cannot be created");
    validateCanonicalConfiguration(change.property.type,change.property.config);
    const created=CareerPropertyDefinitionV2Schema.parse({...change.property,id:change.property.id??randomUUID(),order:change.property.order??next.length,version:1,deletedAt:null});
    if(next.some(d=>d.id===created.id || d.key===created.key)) throw new CareerError(409,"property ID or key already exists");
    next.push(created);const value=defaultValue(created);
    if(value) operation={kind:"default",source:null,target:created,defaultValue:value,confirmLossy:false};
    if(created.type==="formula" || created.type==="rollup") recomputePropertyIds.push(created.id);
  } else {
    const index=next.findIndex(d=>d.id===change.propertyId);const source=index<0?undefined:next[index];
    if(!source) throw new CareerError(404,"property not found");
    if(source.system) throw new CareerError(403,"system property cannot be changed");
    if(change.kind!=="restore" && source.deletedAt!==null) throw new CareerError(409,"property is deleted");
    const target={...source,version:nextVersion(source.version)};
    if(change.kind==="rename") target.name=change.name;
    if(change.kind==="reorder") target.order=change.order;
    if(change.kind==="configure") {
      if(source.type!=="formula" && source.type!=="rollup") throw new CareerError(400,"only computed properties can be configured");
      validateCanonicalConfiguration(source.type,change.config);target.config=change.config;recomputePropertyIds.push(target.id);
    }
    if(change.kind==="delete") {
      target.deletedAt=now.toISOString();
      if(WRITABLE.has(source.type) || customTimestamp(source) || source.type==="relation") operation={kind:"deletion",source,target,defaultValue:null,confirmLossy:false};
      recomputePropertyIds.push(source.id);
    }
    if(change.kind==="restore") {
      if(source.deletedAt===null) throw new CareerError(409,"property is not deleted");
      if(next.some(d=>d.id!==source.id && d.key===source.key)) throw new CareerError(409,"restored property key is in use");
      validateCanonicalConfiguration(source.type,source.config);target.deletedAt=null;
      if(WRITABLE.has(source.type) || customTimestamp(source) || source.type==="relation") operation={kind:"restoration",source,target,defaultValue:null,confirmLossy:false};
      recomputePropertyIds.push(source.id);
    }
    if(change.kind==="type-change") {
      if(!WRITABLE.has(source.type) || !WRITABLE.has(change.type)) throw new CareerError(403,"property type is protected");
      target.type=change.type;target.config=change.config??source.config;validateCanonicalConfiguration(target.type,target.config);
      const optionIds=(d: CareerPropertyDefinitionV2)=>Array.isArray(d.config.options)?d.config.options.map(option=>(option as {id:string}).id):[];
      if(source.type!==target.type || optionIds(source).some(id=>!optionIds(target).includes(id))) operation={kind:"conversion",source,target,defaultValue:null,confirmLossy:false};
      recomputePropertyIds.push(target.id);
    }
    next[index]=target;
  }
  return {next,operation,recomputePropertyIds};
}

/** 사용자별 태그 metadata만 등록합니다. Record 값과 공용 schema는 Spring 또는 schema owner에 남깁니다. */
export async function registerCanonicalCareerPropertyOption(context:MongoContext,userId:string,categoryId:string,propertyId:string,raw:CareerRegisterPropertyOption) {
 const input=CareerRegisterPropertyOptionSchema.parse(raw);
 try {
  const row=await registerCareerPropertyOption(context.db,{userId,categoryId,propertyId},input.label);
  return CareerPropertyOptionResponseSchema.parse({data:{id:row.optionId,name:row.rawLabel},version:row.version});
 } catch(error) {
  const code=error instanceof Error?error.message:"";
  const status=code==="CAREER_OPTION_USER_NOT_ACTIVE"?401:
   ["CAREER_OPTION_CATEGORY_NOT_FOUND","CAREER_OPTION_CATEGORY_OWNER_MISMATCH","CAREER_OPTION_DEFINITION_NOT_FOUND"].includes(code)?404:
   ["CAREER_OPTION_MAPPING_CONFLICT","CAREER_OPTION_VERSION_CONFLICT","CAREER_OPTION_UNVERIFIED_CANONICAL_ID"].includes(code)?409:503;
  throw new CareerError(status,"private Career option registration unavailable",{reason:status===503?"CAREER_OPTIONS_NOT_PREPARED":code});
 }
}
/** B2가 명시적으로 연결할 준비용 서비스입니다. 기존 제품 service/route에서는 생성하지 않습니다. */
export class MongoCanonicalCareerPropertySchemaService {
  constructor(private readonly context: MongoContext,private readonly secret: string) {if(Buffer.byteLength(secret,"utf8")<32) throw new Error("preview secret must contain at least 32 UTF-8 bytes");}
  registerOption(userId:string,categoryId:string,propertyId:string,input:CareerRegisterPropertyOption) { return registerCanonicalCareerPropertyOption(this.context,userId,categoryId,propertyId,input); }
  private binding(userId: string,category: CareerCategoryDoc,change: CareerPropertySchemaChange,privateOptionFingerprint:string) {
    return {userId,categoryId:category._id,version:category.version,schemaVersion:category.schemaVersion??category.version,
      schemaFingerprint:mutationFingerprint(definitions(category)),privateOptionFingerprint,changeFingerprint:mutationFingerprint(change)};
  }
  private snapshot(userId:string,category:CareerCategoryDoc,prepared:ReturnType<typeof prepare>,rows:CareerPropertyOptionDoc[]):CareerPropertyOptionSnapshot {
    const propertyId=prepared.operation?.target.id;
    return prepareCareerPropertyOptionSnapshot(rows.filter(row=>row.propertyId===propertyId),{userId,categoryId:category._id},prepared.next);
  }
  private policy(userId:string,category:CareerCategoryDoc,prepared:ReturnType<typeof prepare>,snapshot:CareerPropertyOptionSnapshot):CareerPropertyOptionPolicy[] {
    const operation=prepared.operation;if(!operation)return [];
    return readCareerPropertyOptionSnapshot({userId,categoryId:category._id,propertyId:operation.target.id,...snapshot},prepared.next);
  }
  private sign(payload: unknown) {const body=Buffer.from(mutationCanonicalJson(payload)).toString("base64url");return `${body}.${createHmac("sha256",this.secret).update(body).digest("base64url")}`;}
  private verify(token: string,binding: unknown) {
    try {const [body,signature,...extra]=token.split(".");if(!body || !signature || extra.length)return false;
      const expected=createHmac("sha256",this.secret).update(body).digest("base64url");
      if(signature.length!==expected.length || !timingSafeEqual(Buffer.from(signature),Buffer.from(expected)))return false;
      const payload=JSON.parse(Buffer.from(body,"base64url").toString("utf8"));
      return typeof payload.expiresAt==="number" && payload.expiresAt>=Date.now() && mutationCanonicalJson(payload.binding)===mutationCanonicalJson(binding);
    }catch{return false;}
  }
  private async impact(category: CareerCategoryDoc,change: CareerPropertySchemaChange,operation: CareerPropertyMutationPlan|null,policy:readonly CareerPropertyOptionPolicy[],session?: import("mongodb").ClientSession) {
    const db=mongoCollections(this.context.db);const options=session?{session}:{};
    const effective=operation?effectiveCanonicalMutationOperation(operation,policy,{userId:category.userId!,categoryId:category._id}):null;
    const base: Filter<CareerRecordDoc>={userId:category.userId!,categoryId:category._id,deletedAt:null};
    let rows: CareerRecordDoc[]=[];
    if(operation) {
      if(await db.careerRecords.countDocuments({...base,propertyValues:{$exists:false}},options)) throw new CareerError(409,"CANONICAL_VALUES_NOT_PREPARED");
      const id=operation.target.id;
      if(operation.target.type==="relation") {
        const candidates=operation.kind==="restoration"?await db.careerRelationPropertyTombstones.distinct("recordId",{userId:category.userId!,categoryId:category._id,propertyId:id},options):[...new Set([...await db.careerRecordRelations.distinct("sourceRecordId",{userId:category.userId!,sourcePropertyId:id},options),...await db.careerRecordRelations.distinct("targetRecordId",{userId:category.userId!,inversePropertyId:id},options)])];
        if(candidates.length>LIMIT)throw new CareerError(413,"relation preview scan limit exceeded");
        rows=await db.careerRecords.find({...base,_id:{$in:candidates}},options).sort({_id:1}).limit(LIMIT+1).toArray();
      } else {
      let filter: Filter<CareerRecordDoc>=operation.kind==="default"?{...base,propertyValues:{$not:{$elemMatch:{propertyDefinitionId:id}}}}:
        operation.kind==="restoration"?{...base,[`propertyValueTombstones.${id}`]:{$exists:true}}:{...base,"propertyValues.propertyDefinitionId":id};
      if(operation.kind==="conversion" && operation.source?.type===operation.target.type && ["select","multi_select"].includes(operation.target.type)) {
        const ids=(definition:CareerPropertyDefinitionV2)=>((definition.config.options??[]) as Array<{id:string}>).map(option=>option.id);
        const removed=ids(effective!.source!).filter(option=>!ids(effective!.target).includes(option));
        filter={...base,propertyValues:{$elemMatch:{propertyDefinitionId:id,value:{$in:removed}}}};
      }
      rows=await db.careerRecords.find(filter,options).sort({_id:1}).limit(LIMIT+1).toArray();
      }
      if(rows.length>LIMIT) throw new CareerError(413,"property preview scan limit exceeded");
    }
    const lossyExamples: Array<{recordId:string;before:unknown;after?:unknown}>=[];let convertibleCount=rows.length;
    for(const row of rows) {
      if(operation!.target.type==="relation") {
        if(operation!.kind==="deletion") {
          const edges=await db.careerRecordRelations.find({userId:category.userId!,$or:[{sourceRecordId:row._id,sourcePropertyId:operation!.target.id},{targetRecordId:row._id,inversePropertyId:operation!.target.id}]},options).limit(2001).toArray();
          const targets=[...new Set(edges.map(edge=>edge.sourceRecordId===row._id?edge.targetRecordId:edge.sourceRecordId))].sort();
          if(edges.length>2000 || targets.length>1000)throw new CareerError(413,"relation edge limit exceeded");
          if(edges.length && lossyExamples.length<20)lossyExamples.push({recordId:row._id,before:targets});
        } else {
          const backup=await db.careerRelationPropertyTombstones.findOne({userId:category.userId!,categoryId:category._id,propertyId:operation!.target.id,recordId:row._id},options),source=operation!.source!;
          try {
            if(!backup || backup.definitionVersion!==source.version || backup.deletedAt!==source.deletedAt || backup.sourceRecordVersion!==row.version || mutationCanonicalJson(backup.config)!==mutationCanonicalJson(source.config))throw new Error("relation generation mismatch");
            const deletion=await db.careerPropertyMutations.findOne({_id:backup.deletionMutationId,userId:category.userId!,categoryId:category._id},options);
            if(!deletion)throw new Error("relation deletion job missing");
            const deleted=mutationJobPlan(deletion);
            if(deleted.operation.kind!=="deletion" || deleted.operation.target.type!=="relation" || deleted.categoryVersion!==backup.categoryVersion || deleted.schemaVersion!==backup.schemaVersion || mutationCanonicalJson(deleted.operation.target)!==mutationCanonicalJson(source) || !deleted.recordIds.includes(row._id))throw new Error("relation deletion binding mismatch");
            for(const [recordId,expectedVersion] of Object.entries(backup.inverseRecordVersions)) {
              const target=await db.careerRecords.findOne({_id:recordId,userId:category.userId!,deletedAt:null},options);
              if(!target || target.version!==expectedVersion || (target.referenceVersion??0)!==backup.inverseRecordReferenceVersions[recordId])throw new Error("relation endpoint guard changed");
            }
            for(const binding of backup.inverseDefinitionBindings) {
              const inverseCategory=await db.careerCategories.findOne({_id:binding.categoryId,$or:[{userId:category.userId!},{userId:null}]},options);
              const inverse=binding.categoryId===category._id && binding.definitionId===operation!.target.id?operation!.target:inverseCategory?.propertySchemaV2?.find(definition=>definition.id===binding.definitionId && definition.deletedAt===null && definition.type==="relation");
              if(!inverse || mutationCanonicalJson(inverse.config)!==mutationCanonicalJson(binding.config))throw new Error("inverse definition changed");
              if(await db.careerPropertyMutations.findOne({userId:category.userId!,categoryId:binding.categoryId,active:true},options))throw new Error("related category mutation active");
            }
          }catch{throw new CareerError(409,"relation restoration provenance or endpoint guard changed");}
        }
        continue;
      }
      const before=readCanonicalCareerPropertyValues(row).find(value=>value.propertyDefinitionId===operation!.target.id);
      try{assertCanonicalMutationValue(operation!.target,before);}catch{throw new CareerError(409,"custom timestamp canonical value is invalid");}
      if(operation!.kind==="conversion" && before) {
        const result=convertCanonicalPropertyValue(before,effective!.target);
        if(result.kind==="unmapped")convertibleCount--;
        if((result.kind==="unmapped" || result.kind==="lossy") && lossyExamples.length<20)lossyExamples.push({recordId:row._id,before,...(result.kind==="unmapped"?{}:{after:result.value})});
      } else if(operation!.kind==="restoration") {
        try {
          const backup=(row.propertyValueTombstones as Record<string,any>)[operation!.target.id];
          const source=operation!.source!;
          if(!backup || backup.propertyDefinitionId!==source.id || backup.categoryId!==category._id || backup.definitionVersion!==source.version || backup.deletedAt!==source.deletedAt || backup.type!==source.type || mutationCanonicalJson(backup.config)!==mutationCanonicalJson(source.config))throw new Error("tombstone provenance mismatch");
          const deletion=await db.careerPropertyMutations.findOne({_id:backup.deletionMutationId,userId:category.userId!,categoryId:category._id},options);
          if(!deletion)throw new Error("tombstone deletion job missing");
          const deletionPlan=mutationJobPlan(deletion);
          if(deletionPlan.operation.kind!=="deletion" || deletionPlan.categoryVersion!==backup.categoryVersion || deletionPlan.schemaVersion!==backup.schemaVersion || mutationCanonicalJson(deletionPlan.operation.target)!==mutationCanonicalJson(source) || !deletionPlan.recordIds.includes(row._id))throw new Error("tombstone deletion binding mismatch");
          const value=readCanonicalCareerPropertyValues({propertyValues:[backup.value]})[0]!;
          assertCanonicalMutationValue(operation!.target,value);
          if(value.propertyDefinitionId!==operation!.target.id || convertCanonicalPropertyValue(value,effective!.target).kind!=="exact")throw new Error("tombstone definition mismatch");
        }catch {throw new CareerError(409,"restoration tombstone no longer matches its definition");}
      } else if(operation!.kind==="deletion" && before && lossyExamples.length<20)lossyExamples.push({recordId:row._id,before});
    }
    if(change.kind==="create" && change.property.required && !Object.hasOwn(change.property.config,"defaultValue") && await db.careerRecords.countDocuments(base,options)) throw new CareerError(409,"required property needs a default value for existing records");
    const propertyId="propertyId" in change?change.propertyId:null;const current=definitions(category);
    const views=propertyId?await db.careerViews.find({userId:category.userId!,categoryId:category._id},options).limit(100).toArray():[];
    return {rows,impact:{affectedRecordCount:rows.length,convertibleCount,lossyExamples,
      dependentViews:propertyId?views.filter(view=>containsReference(view,propertyId)).map(view=>view._id):[],
      dependentFormulas:propertyId?current.filter(d=>d.type==="formula" && containsReference(d.config,propertyId)).map(d=>d.id).slice(0,100):[],
      dependentRollups:propertyId?current.filter(d=>d.type==="rollup" && containsReference(d.config,propertyId)).map(d=>d.id).slice(0,100):[]}};
  }
  async previewChange(userId: string,categoryId: string,raw: CareerPropertySchemaChange) {
    const change=CareerPropertySchemaChangeSchema.parse(raw);const db=mongoCollections(this.context.db);
    const category=await db.careerCategories.findOne({_id:categoryId,userId,isSystem:false});if(!category)throw new CareerError(404,"career category not found");
    const prepared=prepare(category,change,new Date());const privateRows=await readCareerCategoryPropertyOptions(this.context.db,{userId,categoryId});
    const snapshot=this.snapshot(userId,category,prepared,privateRows);const policy=this.policy(userId,category,prepared,snapshot);const {impact}=await this.impact(category,change,prepared.operation,policy);
    if(prepared.recomputePropertyIds.length && !prepared.operation) impact.affectedRecordCount=impact.convertibleCount=await db.careerRecords.countDocuments({userId,categoryId,deletedAt:null});
    return CareerPropertyChangePreviewSchema.parse({categoryId,categoryVersion:category.version,change,impact,previewToken:this.sign({binding:this.binding(userId,category,change,snapshot.privateOptionSnapshotFingerprint),expiresAt:Date.now()+15*60_000})});
  }
  async applyChange(userId: string,categoryId: string,expectedVersion: number,key: string,raw: ApplyCareerPropertyChange) {
    const input=ApplyCareerPropertyChangeSchema.parse(raw);if(!key || key.length>128)throw new CareerError(400,"idempotency key required");
    const requestHash=mutationFingerprint({expectedVersion,input});const resultKey=mutationFingerprint(key);
    return inTransaction(this.context,async tx=>{
      await requireActiveUser(tx,userId);const db=mongoCollections(tx.db);
      const category=await db.careerCategories.findOne({_id:categoryId,userId,isSystem:false},{session:tx.session});if(!category)throw new CareerError(404,"career category not found");
      const prior=category.propertyMutationResults?.[resultKey] as {requestHash:string;category:ReturnType<typeof mapMongoCategory>}|undefined;
      if(prior){if(prior.requestHash!==requestHash)throw new CareerError(409,"idempotency key reused");return prior.category;}
      const now=new Date();const prepared=prepare(category,input.change,now);
      const privateRows=await db.careerPropertyOptions.find({userId,categoryId},{session:tx.session,collation:{locale:"simple"}}).toArray();
      const snapshot=this.snapshot(userId,category,prepared,privateRows);const policy=this.policy(userId,category,prepared,snapshot);
      if(category.version!==expectedVersion || !this.verify(input.previewToken,this.binding(userId,category,input.change,snapshot.privateOptionSnapshotFingerprint)))throw new CareerError(409,"preview token is stale or invalid");
      if(await db.careerPropertyMutations.findOne({userId,categoryId,active:true},{session:tx.session}))throw new CareerError(409,"category property mutation is active");
      const {rows,impact}=await this.impact(category,input.change,prepared.operation,policy,tx.session);
      if(impact.convertibleCount<impact.affectedRecordCount)throw new CareerError(409,"some property values cannot be converted");
      if(impact.lossyExamples.length && !input.confirmLossy)throw new CareerError(409,"lossy mutation requires confirmation");
      const version=nextVersion(category.version),schemaVersion=nextVersion(category.schemaVersion??category.version);
      const mapped=mapMongoCategory({...category,propertySchemaV2:overlayCareerPropertyOptions(prepared.next,privateRows,{userId,categoryId}),version,schemaVersion,updatedAt:now});
      const changed=await db.careerCategories.updateOne({_id:categoryId,userId,version:expectedVersion},{ $set:{propertySchemaV2:prepared.next,version,schemaVersion,updatedAt:now,[`propertyMutationResults.${resultKey}`]:{requestHash,category:mapped}}},{session:tx.session});
      if(changed.matchedCount!==1)throw new CareerError(409,"category version is stale");
      if(prepared.operation && rows.length) {
        const plan=CareerPropertyMutationJobPlanSchema.parse({userId,categoryId,categoryVersion:version,schemaVersion,definitions:prepared.next,recordIds:rows.map(row=>row._id),operation:{...prepared.operation,confirmLossy:input.confirmLossy}});
        const planJson=mutationCanonicalJson(plan);if(Buffer.byteLength(planJson)>2_097_152)throw new CareerError(413,"mutation plan exceeds storage limit");
        const mutationId=randomUUID();const operationFingerprint=mutationFingerprint(plan);
        const job: CareerPropertyMutationDoc={_id:mutationId,userId,categoryId,propertyId:plan.operation.target.id,planJson,operationFingerprint,...snapshot,status:"pending",active:true,cursor:0,processedCount:0,skippedCount:0,attempts:0,leaseToken:null,leaseUntil:null,lastError:null,commitFence:0,createdAt:now,updatedAt:now,completedAt:null};
        await db.careerPropertyMutations.insertOne(job,{session:tx.session});
        await addMongoOutboxEvent(tx,{userId,topic:"career.property-mutation",idempotencyKey:`career-canonical-schema:${mutationId}`,payload:{mutationId,operationFingerprint}});
      }
      if(prepared.recomputePropertyIds.length && !(prepared.operation && rows.length)) {
        const records=await db.careerRecords.find({userId,categoryId,deletedAt:null},{session:tx.session}).project({_id:1,version:1}).limit(LIMIT+1).toArray();
        if(records.length>LIMIT)throw new CareerError(409,"computed property recomputation exceeds the category limit");
        const sourcePropertyVersions=Object.fromEntries(prepared.next.filter(d=>prepared.recomputePropertyIds.includes(d.id)).map(d=>[d.id,d.version]));
        for(const record of records)await addMongoOutboxEvent(tx,{userId,topic:"career.computation",idempotencyKey:`career-canonical-computed:${categoryId}:v${schemaVersion}:${record._id}`,payload:{userId,recordId:record._id,changedPropertyIds:prepared.recomputePropertyIds,sourceRecordVersion:record.version,sourcePropertyVersions,sourceSchemaVersion:schemaVersion,sourceCategoryVersion:version}});
      }
      return mapped;
    });
  }
}
