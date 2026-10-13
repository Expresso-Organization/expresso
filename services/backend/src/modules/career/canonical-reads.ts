import { careerDocumentToMarkdown,reconstructYDocument } from "@expresso/editor";
import { CareerRecordSchema,CareerPendingPropertyMutationSchema,CareerPropertyDefinitionV2Schema,type CareerPropertyDefinitionV2 } from "@expresso/contracts";
import { projectCanonicalCareerProductProperties,mongoCollections,readCanonicalCareerPropertyValues,readCareerCategoryPropertyOptions,readCareerPropertyOptionSnapshot,overlayCareerPropertyOptionSnapshot,overlayCareerPropertyOptions,type CareerCategoryDoc,type CareerRecordDoc } from "@expresso/database";
import type { ClientSession } from "mongodb";
import type { MongoContext } from "../../platform/mongodb.js";
import { inTransaction } from "../../platform/mongo-transaction.js";
import { readCareerSnapshotUpdate } from "../../platform/career-document-snapshot.js";
import { CareerError } from "./errors.js";
import { mapMongoRecord } from "./mongo-records.js";
import { mapMongoCategory,requireCareerCategory } from "./mongo-categories.js";
import { mutationCanonicalJson,mutationJobPlan } from "./property-mutation-state.js";
import { canonicalRecordReadDefinitions } from "./canonical-read-context.js";

/** 읽기 전용 overlay이며 공용 schema와 사용자 canonical 값을 갱신하지 않습니다. */
export class CanonicalCareerReadService {
 constructor(readonly context:MongoContext) {}
 private async activeJob(userId:string,category:CareerCategoryDoc,session?:ClientSession) {
  const job=await mongoCollections(this.context.db).careerPropertyMutations.findOne({userId,categoryId:category._id,active:true},session?{session}:{});
  if(!job)return null;
  if(category.userId!==userId || category.isSystem)throw new CareerError(503,"unexpected shared category mutation");
  try {
   const plan=mutationJobPlan(job),target=category.propertySchemaV2?.find(definition=>definition.id===job.propertyId);
   if(category.version!==plan.categoryVersion || category.schemaVersion!==plan.schemaVersion || !target || mutationCanonicalJson(target)!==mutationCanonicalJson(plan.operation.target))throw new Error("schema binding changed");
   return {job,plan};
  }catch{throw new CareerError(409,"CAREER_MUTATION_READ_STATE_INVALID");}
 }
 private async readDefinitions(userId:string,category:CareerCategoryDoc,session?:ClientSession) {
  if(!category.propertySchemaV2 || !category.schemaVersion)throw new CareerError(409,"CANONICAL_SCHEMA_NOT_PREPARED");
  const raw=category.propertySchemaV2.map(value=>CareerPropertyDefinitionV2Schema.parse(value)),scope={userId,categoryId:category._id};
  try{projectCanonicalCareerProductProperties(raw,[]);}catch(error){throw new CareerError(409,error instanceof Error?error.message:"INVALID_CANONICAL_SCHEMA");}
  const rows=await readCareerCategoryPropertyOptions(this.context.db,scope),active=await this.activeJob(userId,category,session);
  if(!active)return {definitions:overlayCareerPropertyOptions(raw,rows,scope),active:null,source:null};
  const {job,plan}=active;
  try{
   const policyDefinitions=plan.operation.source?[...plan.definitions,plan.operation.source]:plan.definitions;
   const policy=readCareerPropertyOptionSnapshot(job,policyDefinitions,rows.some(row=>row.propertyId===job.propertyId));
   // 실행 중인 한 속성은 불변 snapshot을 쓰고 다른 속성만 live metadata를 읽습니다.
   const others=overlayCareerPropertyOptions(raw,rows.filter(row=>row.propertyId!==job.propertyId),scope);
   const target=overlayCareerPropertyOptionSnapshot([plan.operation.target],policy,scope)[0]!;
   const source=plan.operation.source?overlayCareerPropertyOptionSnapshot([plan.operation.source],policy,scope)[0]!:null;
   return {definitions:others.map(definition=>definition.id===job.propertyId?target:definition),active,source};
  }catch(error){throw new CareerError(409,error instanceof Error && error.message.startsWith("CAREER_PRIVATE_OPTIONS_")?error.message:"CAREER_PRIVATE_OPTIONS_SNAPSHOT_INVALID");}
 }
 async definitions(userId:string,category:CareerCategoryDoc):Promise<CareerPropertyDefinitionV2[]> {
  return (await this.readDefinitions(userId,category)).definitions;
 }
 /** 뷰도 기록 표시와 같은 frozen source/target 및 관계 대기 정책을 읽습니다. */
 async viewReadContext(userId:string,category:CareerCategoryDoc,session?:ClientSession) {
  const state=await this.readDefinitions(userId,category,session),blockedRelationIds=new Set<string>();
  if(state.active?.plan.operation.target.type==="relation")blockedRelationIds.add(state.active.job.propertyId);
  for(const definition of state.definitions.filter(item=>item.deletedAt===null&&item.type==="relation")) {
   if(typeof definition.config.targetCategoryId!=="string"||typeof definition.config.inversePropertyId!=="string")continue;
   const other=await mongoCollections(this.context.db).careerCategories.findOne({_id:definition.config.targetCategoryId,$or:[{userId},{userId:null}]},session?{session}:{});
   if(!other)continue;
   const active=await this.activeJob(userId,other,session);
   if(active?.plan.operation.target.type==="relation"&&active.job.propertyId===definition.config.inversePropertyId)blockedRelationIds.add(definition.id);
  }
  return {definitions:state.definitions,source:state.source,target:state.active?state.definitions.find(definition=>definition.id===state.active!.job.propertyId)??null:null,blockedRelationIds:[...blockedRelationIds]};
 }
 private async markdown(record:CareerRecordDoc,session?:ClientSession):Promise<string> {
  const db=mongoCollections(this.context.db),options=session?{session}:{};
  const snapshot=await db.careerDocumentSnapshots.findOne({recordId:record._id,userId:record.userId},{sort:{documentVersion:-1},...options});
  if(!snapshot)return record.bodyMd;
  const updates=await db.careerDocumentUpdates.find({recordId:record._id,userId:record.userId,serverSequence:{$gt:snapshot.serverSequence},compactedAt:null},options).sort({serverSequence:1}).limit(10001).toArray();
  if(updates.length>10000)throw new CareerError(503,"document compaction is required before projection");
  try{return careerDocumentToMarkdown(reconstructYDocument([readCareerSnapshotUpdate(snapshot),...updates.map(row=>new Uint8Array(row.update.buffer))]));}
  catch {throw new CareerError(503,"document projection is unavailable");}
 }
 /** 삭제/복원 중인 관계는 부분 집합을 완성된 빈 값으로 표시하지 않습니다. */
 async relationProjection(record:CareerRecordDoc,definitions:readonly CareerPropertyDefinitionV2[],session?:ClientSession) {
  const db=mongoCollections(this.context.db),options=session?{session}:{};
  const properties:Record<string,{type:"relation";value:{recordId:string;title:string}[]}>={},blocked=new Set<string>();
  const records=new Map<string,CareerRecordDoc|null>([[record._id,record]]);
  const categories=new Map<string,Promise<{category:CareerCategoryDoc;active:Awaited<ReturnType<CanonicalCareerReadService["activeJob"]>>}|null>>();
  const context=(categoryId:string)=>{
   if(!categories.has(categoryId))categories.set(categoryId,(async()=>{
    const category=await db.careerCategories.findOne({_id:categoryId,$or:[{userId:record.userId},{userId:null}]},options);
    if(!category)return null;
    if(!category.propertySchemaV2 || !category.schemaVersion)throw new CareerError(409,"CANONICAL_SCHEMA_NOT_PREPARED");
    return {category,active:await this.activeJob(record.userId,category,session)};
   })());
   return categories.get(categoryId)!;
  };
  const binding=async(categoryId:string,propertyId:string)=>{
   const result=await context(categoryId),definition=result?.category.propertySchemaV2?.find(item=>item.id===propertyId && item.type==="relation");
   const active=result?.active,job=active?.plan.operation.target.type==="relation" && active.job.propertyId===propertyId?active:null;
   return {definition,job};
  };
  const own=await context(record.categoryId);
  if(own?.active?.plan.operation.target.type==="relation")blocked.add(own.active.job.propertyId);
  for(const definition of definitions.filter(item=>item.deletedAt===null && item.type==="relation")) {
   if(blocked.has(definition.id))continue;
   // 역방향의 연결된 속성만 잠그며 카테고리의 다른 업무 필드는 그대로 읽습니다.
   if(typeof definition.config.targetCategoryId==="string" && typeof definition.config.inversePropertyId==="string"){
    const inverse=await binding(definition.config.targetCategoryId,definition.config.inversePropertyId);
    if(inverse.job){blocked.add(definition.id);continue;}
   }
   const edges=await db.careerRecordRelations.find({userId:record.userId,$or:[{sourceRecordId:record._id,sourcePropertyId:definition.id},{targetRecordId:record._id,inversePropertyId:definition.id}]},options).limit(2001).toArray();
   if(edges.length>2000)throw new CareerError(409,"relation edge limit exceeded");
   const ids=[...new Set(edges.map(edge=>edge.sourceRecordId===record._id && edge.sourcePropertyId===definition.id?edge.targetRecordId:edge.sourceRecordId))];
   if(ids.length>1000)throw new CareerError(409,"relation target limit exceeded");
   const missing=[...new Set(edges.flatMap(edge=>[edge.sourceRecordId,edge.targetRecordId]))].filter(id=>!records.has(id));
   if(missing.length){
    const found=await db.careerRecords.find({_id:{$in:missing},userId:record.userId,deletedAt:null},options).toArray();
    for(const id of missing)records.set(id,null);
    for(const row of found)records.set(row._id,row);
   }
   const visible=new Set<string>();
   for(const edge of edges){
    const source=records.get(edge.sourceRecordId),target=records.get(edge.targetRecordId);
    if(!source || !target)continue;
    const forward=await binding(source.categoryId,edge.sourcePropertyId);
    if(forward.job){blocked.add(definition.id);break;}
    if(!forward.definition || forward.definition.deletedAt!==null)continue;
    if(typeof edge.inversePropertyId==="string"){
     const inverse=await binding(target.categoryId,edge.inversePropertyId);
     if(inverse.job){blocked.add(definition.id);break;}
     if(!inverse.definition || inverse.definition.deletedAt!==null)continue;
    }
    const other=edge.sourceRecordId===record._id && edge.sourcePropertyId===definition.id?target:source;
    if(other.categoryId===String(definition.config.targetCategoryId))visible.add(other._id);
   }
   if(blocked.has(definition.id))continue;
   properties[definition.key]={type:"relation",value:[...visible].sort().map(id=>({recordId:id,title:records.get(id)!.title}))};
  }
  return {properties,blockedPropertyIds:[...blocked].sort()};
 }
 async mapRecord(record:CareerRecordDoc,category?:CareerCategoryDoc,session?:ClientSession) {
  const ownedCategory=category??await requireCareerCategory(this.context,record.userId,record.categoryId,session);
  const state=await this.readDefinitions(record.userId,ownedCategory,session);
  let definitions=state.definitions;
  const job=state.active?.job;
  let pending:ReturnType<typeof CareerPendingPropertyMutationSchema.parse>|undefined;
  if(job) {
   if(ownedCategory.userId!==record.userId || ownedCategory.isSystem)throw new CareerError(503,"unexpected shared category mutation");
   const plan=mutationJobPlan(job);
   pending=CareerPendingPropertyMutationSchema.parse({jobId:job._id,status:job.status,retryable:job.status==="failed",sourceProperty:state.source});
   definitions=canonicalRecordReadDefinitions(definitions,readCanonicalCareerPropertyValues(record),pending.sourceProperty);
  }
  const mapped=mapMongoRecord(record,await this.markdown(record,session),{definitions,requireCanonical:true});
  const relation=await this.relationProjection(record,definitions,session);
  return CareerRecordSchema.parse({...mapped,properties:{...mapped.properties,...relation.properties},...(pending?{pendingPropertyMutation:pending}:{}),...(relation.blockedPropertyIds.length?{pendingRelationPropertyIds:relation.blockedPropertyIds}:{})});
 }
 /** 검색·재료 순위에서는 선택한 옵션 ID를 소유자 범위의 정확한 label로 읽습니다. */
 async searchableRecordText(record:CareerRecordDoc,session?:ClientSession):Promise<string> {
  const category=await requireCareerCategory(this.context,record.userId,record.categoryId,session),mapped=await this.mapRecord(record,category,session),state=await this.readDefinitions(record.userId,category,session);
  const definitions=state.active?canonicalRecordReadDefinitions(state.definitions,readCanonicalCareerPropertyValues(record),state.source):state.definitions,properties:Record<string,unknown>={...mapped.properties};
  for(const value of mapped.propertyValues??[]) {
   if(value.type!=="select"&&value.type!=="multi_select")continue;
   const definition=definitions.find(item=>item.id===value.propertyDefinitionId&&item.deletedAt===null);if(!definition)continue;
   const options=Array.isArray(definition.config.options)?definition.config.options as {id:string;name?:string;label?:string}[]:[],ids=value.type==="select"?(value.value===null?[]:[value.value]):value.value;
   const labels=ids.map(id=>{const option=options.find(item=>item.id===id),label=option?.label??option?.name;if(typeof label!=="string")throw new CareerError(409,"CANONICAL_OPTION_LABEL_UNAVAILABLE");return label;});
   properties[definition.key]=value.type==="select"?labels[0]??null:labels;
  }
  return `${mapped.title}\n${mapped.bodyMd}\n${JSON.stringify(properties)}`;
 }
 async getRecord(userId:string,recordId:string) {
  return inTransaction(this.context,async tx=>{
   const record=await mongoCollections(tx.db).careerRecords.findOne({_id:recordId,userId,deletedAt:null},{session:tx.session});
   if(!record)throw new CareerError(404,"career record not found");
   return this.mapRecord(record,undefined,tx.session);
  });
 }
 async listCategories(userId:string) {
  const categories=await mongoCollections(this.context.db).careerCategories.aggregate<CareerCategoryDoc&{counts:{total:number}[]}>([
   {$match:{$or:[{userId:null},{userId}]}},
   {$lookup:{from:"career_records",let:{categoryId:"$_id"},pipeline:[{$match:{userId,deletedAt:null,$expr:{$eq:["$categoryId","$$categoryId"]}}},{$count:"total"}],as:"counts"}},
   {$sort:{sortOrder:1,_id:1}}
  ]).toArray();
  return Promise.all(categories.map(async category=>mapMongoCategory({...category,propertySchemaV2:await this.definitions(userId,category)},category.counts[0]?.total??0)));
 }
}
