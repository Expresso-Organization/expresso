import {createHash} from "node:crypto";
import {
 CareerCategoryMoveCommitSchema,CareerCategoryMovePreviewSchema,CareerRecordResponseSchema,CareerProducerIntentSchema,CareerProducerScopeSchema,CareerWriteOperationResponseSchema,
 CreateCareerRecordSchema,UpdateCareerRecordSchema,CareerWriterCreateSchema,CareerWriterPatchSchema,UuidSchema,
 type CareerWriteOperationResponse,type CareerProducerBusinessCommand,type CareerProducerDocumentCommand,type CareerProducerScope,type CareerProducerIntent,
 type CreateCareerRecord,type UpdateCareerRecord,type CareerPropertyDefinitionV2,
} from "@expresso/contracts";
import {mongoCollections,readCanonicalCareerPropertyValues} from "@expresso/database";
import type {MongoContext} from "../../platform/mongodb.js";
import type {CareerApi} from "./index.js";
import {CareerError} from "./errors.js";
import {CanonicalCareerReadService} from "./canonical-reads.js";
import {listCanonicalCareerRecords} from "./canonical-record-list.js";
import {MongoCanonicalCareerPropertySchemaService} from "./canonical-property-schema.js";
import {CareerViewService} from "./views.js";
import {MongoCareerComputationService} from "../career-computation/index.js";
import {SpringCareerProductWriter} from "./spring-product-writer.js";
import {translateCareerProductProperties} from "./product-write-values.js";
import {requireCareerCategory} from "./mongo-categories.js";
import {createCanonicalCareerCategory,createCareerLegacyViewMetadata,listCareerLegacyViewMetadata,readCareerProductRecordVersion,getCareerProductProfile,saveCareerProductProfile} from "./product-metadata.js";
import {listMongoSkills,listMongoSkillEvidence,recomputeMongoSkill} from "./mongo-skills.js";
import {mongoDeleteImpact} from "./mongo-links.js";
import {readCareerPropertyMutationStatus,resumeCareerPropertyMutation} from "./property-mutation-status.js";
import {getCareerWriteOperation,publicCareerWriteOperation} from "./write-operation-status.js";
import {mutationFingerprint} from "./property-mutation-state.js";
type CareerRecordResponse=ReturnType<typeof CareerRecordResponseSchema.parse>;
export type CareerProductCreateOperationResult={status:200|201;body:CareerRecordResponse}|{status:202;body:CareerWriteOperationResponse};
export type CareerProductUpdateOperationResult={status:200;body:CareerRecordResponse}|{status:202;body:CareerWriteOperationResponse};
export interface CareerProductPreparedWrites {
 findPrepared?(userId:string,key:string,inputHash:string):Promise<CareerProducerScope|null>;
 prepareWithStatus(userId:string,key:string,inputHash:string,business:CareerProducerBusinessCommand|null,document:CareerProducerDocumentCommand|null,operation:{kind:"create"|"patch";recordId:string|null;expectedBusinessVersion?:number}):Promise<{scope:CareerProducerScope;created:boolean}>;
 execute(scope:CareerProducerScope):Promise<CareerProducerIntent>;
}
export interface CareerProductFacadeOptions {
 springBaseUrl:string;transport?:(url:string,init:RequestInit)=>Promise<Response>;schemaPreviewSecret?:string;preparedWrites?:CareerProductPreparedWrites;
}
function recordResponse(record:CareerRecordResponse["data"]){return CareerRecordResponseSchema.parse({data:record,resource:{version:record.version,updatedAt:record.updatedAt}});}
function stableKey(value:unknown):string {
 const bytes=createHash("sha256").update(mutationFingerprint(value)).digest().subarray(0,16);bytes[6]=(bytes[6]!&15)|128;bytes[8]=(bytes[8]!&63)|128;const hex=bytes.toString("hex");return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
const editable=(definition:CareerPropertyDefinitionV2)=>definition.deletedAt===null&&!['title','formula','rollup','relation'].includes(definition.type)&&!(definition.system&&['created_time','updated_time'].includes(definition.type));
/** 명시적으로 구성한 제품 API이며 기존 업무 writer 객체를 상속하거나 복사하지 않습니다. */
export function createCareerProductFacade(context:MongoContext,options:CareerProductFacadeOptions):CareerApi {
 const reader=new CanonicalCareerReadService(context),views=new CareerViewService(context,{source:"canonical"}),computation=new MongoCareerComputationService(context,"canonical");
 const schemas=options.schemaPreviewSecret?new MongoCanonicalCareerPropertySchemaService(context,options.schemaPreviewSecret):null;
 const schema=()=>{if(!schemas)throw new CareerError(503,"Career schema orchestration is unavailable");return schemas;};
 const writer=new SpringCareerProductWriter(options.springBaseUrl,{getRecord:(user,id)=>reader.getRecord(user,id),version:(user,id,trashed)=>readCareerProductRecordVersion(context,user,id,trashed),deleteImpact:(user,id)=>mongoDeleteImpact(context,user,id,new Date())},options.transport);
 const bind=(credential?:{token:string;userId:string}):CareerApi=>{
  const actor=(userId:string)=>{if(credential&&credential.userId!==userId)throw new CareerError(403,"Career request actor mismatch");};
  const session=(userId:string)=>{actor(userId);if(!credential)throw new CareerError(401,"opaque user session required");return credential.token;};
  async function finishPrepared(userId:string,scope:CareerProducerScope,created:boolean,operation:{kind:"create"|"patch";recordId:string|null},expectedCategoryId?:string){
   const port=options.preparedWrites;if(!port)throw new CareerError(503,"Career product document coordination is unavailable");
   if(!CareerProducerScopeSchema.safeParse(scope).success||scope.userId!==userId||scope.producer!=="career-product")throw new CareerError(503,"Career product operation binding mismatch");
   let publicOperation:CareerWriteOperationResponse["data"];
   try{
    const intent=CareerProducerIntentSchema.parse(await port.execute(scope));
    if(intent.userId!==scope.userId||intent.sourceId!==scope.sourceId||intent.operationId!==scope.operationId||intent.fingerprint!==scope.fingerprint||intent.producer!==scope.producer||intent.businessResult&&intent.businessResult.data.userId!==userId)throw new Error("operation scope changed");
    publicOperation=publicCareerWriteOperation(intent);
   }catch{
    try{publicOperation=(await getCareerWriteOperation(context,userId,scope.operationId)).data;}catch{throw new CareerError(503,"Career product operation status is unavailable");}
   }
   if(["pending","running","retry"].includes(publicOperation.state))return {pending:CareerWriteOperationResponseSchema.parse({data:publicOperation})};
   if(publicOperation.state!=="completed")throw new CareerError(409,"Career product operation requires recovery",{operation:publicOperation});
   if(!publicOperation.recordId||(operation.recordId!==null&&publicOperation.recordId!==operation.recordId))throw new CareerError(503,"Career product operation record binding mismatch");
   const record=await reader.getRecord(userId,publicOperation.recordId);if(expectedCategoryId!==undefined&&record.categoryId!==expectedCategoryId)throw new CareerError(503,"Career product operation category binding mismatch");
   return {record,created};
  }
  async function prepared(userId:string,key:string,inputHash:string,business:CareerProducerBusinessCommand|null,document:CareerProducerDocumentCommand|null,operation:{kind:"create"|"patch";recordId:string|null;expectedBusinessVersion?:number}){
   const port=options.preparedWrites;if(!port)throw new CareerError(503,"Career product document coordination is unavailable");
   const {scope,created}=await port.prepareWithStatus(userId,key,inputHash,business,document,operation);
   return finishPrepared(userId,scope,created,operation,business?.kind==="create"?business.input.categoryId:undefined);
  }
  async function replay(userId:string,key:string,inputHash:string,operation:{kind:"create"|"patch";recordId:string|null},expectedCategoryId?:string){
   const scope=await options.preparedWrites?.findPrepared?.(userId,key,inputHash);return scope?finishPrepared(userId,scope,false,operation,expectedCategoryId):null;
  }
  async function createRecordOperation(userId:string,key:string,raw:CreateCareerRecord):Promise<CareerProductCreateOperationResult>{
   const token=session(userId),input=CreateCareerRecordSchema.parse(raw),inputHash=mutationFingerprint({kind:"create",input});
   if(options.preparedWrites){
    const existing=await replay(userId,key,inputHash,{kind:"create",recordId:null},input.categoryId);if(existing)return "pending"in existing?{status:202,body:existing.pending}:{status:200,body:recordResponse(existing.record)};
   }else if(input.bodyMd!=="")throw new CareerError(503,"Career product document coordination is unavailable");
   const category=await requireCareerCategory(context,userId,input.categoryId),definitions=await reader.definitions(userId,category);
   const translated=input.propertyValues===undefined?translateCareerProductProperties(category._id,definitions,input.properties):{propertyValues:input.propertyValues,relations:[]};
   const initialRelations=[...translated.relations,...(input.initialRelations??[])],relationIds=new Set<string>();
   for(const relation of initialRelations){if(relationIds.has(relation.propertyId))throw new CareerError(400,"Duplicate initial relation property");relationIds.add(relation.propertyId);}
   const businessInput=CareerWriterCreateSchema.parse({categoryId:category._id,title:input.title,propertyValues:translated.propertyValues,...(initialRelations.length?{initialRelations}:{})});
   if(!options.preparedWrites){const result=await writer.create(token,userId,key,businessInput);return {status:result.created?201:200,body:recordResponse(result.record)};}
   const document:CareerProducerDocumentCommand|null=input.bodyMd===""?null:{kind:"markdown",recordId:null,expectedVersion:0,markdown:input.bodyMd,summary:"커리어 기록 생성"};
   const result=await prepared(userId,key,inputHash,{kind:"create",expectedCategoryVersion:category.version,input:businessInput},document,{kind:"create",recordId:null});
   return "pending"in result?{status:202,body:result.pending}:{status:result.created?201:200,body:recordResponse(result.record)};
  }
  async function updateRecordOperation(userId:string,recordId:string,expectedVersion:number,raw:UpdateCareerRecord):Promise<CareerProductUpdateOperationResult>{
   const token=session(userId),input=UpdateCareerRecordSchema.parse(raw),semantic={kind:"patch",userId,recordId,expectedVersion,input},inputHash=mutationFingerprint(semantic),key=stableKey(semantic);
   if(input.bodyMd!==undefined){
    if(!options.preparedWrites)throw new CareerError(503,"Career product document coordination is unavailable");
    const existing=await replay(userId,key,inputHash,{kind:"patch",recordId});if(existing)return "pending"in existing?{status:202,body:existing.pending}:{status:200,body:recordResponse(existing.record)};
   }
   const db=mongoCollections(context.db),row=await db.careerRecords.findOne({_id:recordId,userId,deletedAt:null});
   if(!row)throw new CareerError(404,"career record not found");const category=await requireCareerCategory(context,userId,row.categoryId),definitions=await reader.definitions(userId,category);
   let propertyValues=input.propertyValues,relations:ReturnType<typeof translateCareerProductProperties>["relations"]=[];
   if(input.properties!==undefined){const translated=translateCareerProductProperties(category._id,definitions,input.properties),included=new Set(translated.propertyValues.map(value=>value.propertyDefinitionId));relations=translated.relations;
    propertyValues={set:translated.propertyValues,unsetPropertyIds:readCanonicalCareerPropertyValues(row).filter(value=>!included.has(value.propertyDefinitionId)&&definitions.some(definition=>definition.id===value.propertyDefinitionId&&editable(definition))).map(value=>value.propertyDefinitionId)};
   }
   const patchInput={...(input.title!==undefined?{title:input.title}:{}),...(input.status!==undefined?{status:input.status}:{}),...(propertyValues!==undefined?{propertyValues}:{}),...(relations.length?{relations}:{})};
   const patch=Object.keys(patchInput).length?CareerWriterPatchSchema.parse(patchInput):null;
   if(input.bodyMd===undefined){if(!patch)throw new CareerError(400,"Career business delta is required");return {status:200,body:recordResponse(await writer.patch(token,userId,recordId,expectedVersion,patch))};}
   if(!options.preparedWrites)throw new CareerError(503,"Career product document coordination is unavailable");
   const result=await prepared(userId,key,inputHash,patch?{kind:"patch",recordId,expectedVersion,expectedCategoryVersion:category.version,patches:[patch]}:null,{kind:"markdown",recordId,expectedVersion:row.documentVersion??0,markdown:input.bodyMd,summary:"커리어 본문 저장"},{kind:"patch",recordId,expectedBusinessVersion:expectedVersion});
   return "pending"in result?{status:202,body:result.pending}:{status:200,body:recordResponse(result.record)};
  }
  return {
   forSession:(token,userId)=>{if(!/^exps_[A-Za-z0-9_-]{43}$/.test(token)||!UuidSchema.safeParse(userId).success)throw new CareerError(401,"opaque user session required");return bind({token,userId});},
   createRecordOperation,updateRecordOperation,
   async createRecord(userId,key,input){const result=await createRecordOperation(userId,key,input);if(result.status===202)throw new CareerError(409,"Career product operation is pending",{operation:result.body.data});return {record:result.body.data,created:result.status===201};},
   async updateRecord(userId,recordId,version,input){const result=await updateRecordOperation(userId,recordId,version,input);if(result.status===202)throw new CareerError(409,"Career product operation is pending",{operation:result.body.data});return result.body.data;},
   getRecord:(user,id)=>{actor(user);return reader.getRecord(user,id);},listRecords:(user,query)=>{actor(user);return listCanonicalCareerRecords(reader,user,query);},listCategories:user=>{actor(user);return reader.listCategories(user);},
   createCategory:(user,input)=>{actor(user);return createCanonicalCareerCategory(context,user,input);},
   updatePropertySchema:async(user,categoryId)=>{actor(user);throw Object.assign(new CareerError(409,"BULK_SCHEMA_CHANGE_UNSUPPORTED",{reasonCode:"BULK_SCHEMA_CHANGE_UNSUPPORTED",supportedOperations:{preview:`/v1/career/categories/${categoryId}/property-schema/preview`,apply:`/v1/career/categories/${categoryId}/property-schema/apply`,restore:`/v1/career/categories/${categoryId}/property-schema/:propertyId/restore`}}),{publicErrorCode:"BULK_SCHEMA_CHANGE_UNSUPPORTED" as const});},
   previewChange:(user,categoryId,change)=>{actor(user);return schema().previewChange(user,categoryId,change);},applyChange:(user,categoryId,version,key,input)=>{actor(user);return schema().applyChange(user,categoryId,version,key,input);},
   restoreProperty:async(user,categoryId,propertyId,version)=>{actor(user);const change={kind:"restore" as const,propertyId},preview=await schema().previewChange(user,categoryId,change);if(preview.categoryVersion!==version)throw new CareerError(412,"category version is stale");return schema().applyChange(user,categoryId,version,stableKey({kind:"restore",userId:user,categoryId,propertyId,version}),{change,previewToken:preview.previewToken,confirmLossy:false});},
   registerPropertyOption:(user,categoryId,propertyId,input)=>{actor(user);return schema().registerOption(user,categoryId,propertyId,input);},
   getPropertyMutationStatus:(user,id)=>{actor(user);return readCareerPropertyMutationStatus(context,user,id);},resumePropertyMutation:(user,id)=>{actor(user);return resumeCareerPropertyMutation(context,user,id);},getWriteOperation:(user,id)=>{actor(user);return getCareerWriteOperation(context,user,id);},
   createView:(user,categoryId,input)=>{actor(user);return createCareerLegacyViewMetadata(context,user,categoryId,input);},listViews:(user,categoryId)=>{actor(user);return listCareerLegacyViewMetadata(context,user,categoryId);},
   listViewConfigurations:(user,categoryId)=>{actor(user);return views.list(user,categoryId);},createViewConfiguration:(user,categoryId,version,input)=>{actor(user);return views.create(user,categoryId,version,input);},updateViewConfiguration:(user,id,version,input)=>{actor(user);return views.update(user,id,version,input);},duplicateViewConfiguration:(user,id,version,name)=>{actor(user);return views.duplicate(user,id,version,name);},deleteViewConfiguration:(user,id,version)=>{actor(user);return views.delete(user,id,version);},reorderViewConfigurations:(user,categoryId,version,ids)=>{actor(user);return views.reorder(user,categoryId,version,ids);},queryViewConfiguration:(user,id,cursor,limit)=>{actor(user);return views.query(user,id,cursor,limit);},
   replaceTargets:(user,id,propertyId,targetIds,version)=>writer.relation(session(user),user,id,version,{propertyId,targetIds:[...targetIds]}),
   listRelationTargets:async(user,id,propertyId)=>{actor(user);const record=await reader.getRecord(user,id),category=await requireCareerCategory(context,user,record.categoryId),definition=(await reader.definitions(user,category)).find(item=>item.id===propertyId&&item.deletedAt===null&&item.type==="relation");if(!definition)throw new CareerError(400,"relation property not found");if(record.pendingRelationPropertyIds?.includes(propertyId))throw new CareerError(409,"Career relation mutation is pending");const value=record.properties[definition.key];if(!value||typeof value!=="object"||!("type"in value)||value.type!=="relation")throw new CareerError(503,"Career relation projection is unavailable");return value.value;},
   createLink:(user,id,targetId,relation)=>writer.createLink(session(user),user,id,targetId,relation),listLinks:(user,id)=>writer.listLinks(session(user),user,id),
   getDeleteImpact:(user,id,at=new Date())=>{actor(user);return mongoDeleteImpact(context,user,id,at);},trashRecord:(user,id)=>writer.trash(session(user),user,id),restoreRecord:(user,id)=>writer.restore(session(user),user,id),
   previewCategoryMove:async(user,id,targetCategoryId)=>{const token=session(user),record=await reader.getRecord(user,id),source=await requireCareerCategory(context,user,record.categoryId),target=await requireCareerCategory(context,user,targetCategoryId);await reader.definitions(user,target);const result=await writer.previewMove(token,user,id,record.version,targetCategoryId);if(result.data.targetCategoryId!==targetCategoryId||result.data.version!==record.version)throw new CareerError(503,"Career move preview binding mismatch");return CareerCategoryMovePreviewSchema.parse({recordId:id,sourceCategoryId:source._id,targetCategoryId,recordVersion:record.version,sourceSchemaVersion:source.schemaVersion,targetSchemaVersion:target.schemaVersion,conversions:result.data.conversions,unmappedProperties:Object.fromEntries(result.data.conversions.filter(item=>result.data.unmappedPropertyIds.includes(item.sourcePropertyId)).map(item=>[item.sourcePropertyId,item.sampleBefore])),previewToken:result.data.previewToken});},
   commitCategoryMove:(user,id,raw)=>{const token=session(user),input=CareerCategoryMoveCommitSchema.parse(raw);if(input.recordId!==id)throw new CareerError(400,"Career move record binding mismatch");return writer.move(token,user,id,input.expectedVersion,{targetCategoryId:input.targetCategoryId,previewToken:input.previewToken,discardUnmappedPropertyIds:input.discardUnmappedPropertyIds});},
   previewFormula:(user,input)=>{actor(user);return computation.previewFormula(user,input);},previewRollup:(user,input)=>{actor(user);return computation.previewRollup(user,input);},
   recomputeSkill:(user,input,at=new Date())=>{actor(user);return recomputeMongoSkill(context,user,input,at,reader);},listSkills:user=>{actor(user);return listMongoSkills(context,user);},listSkillEvidence:(user,id)=>{actor(user);return listMongoSkillEvidence(context,user,id);},
   getProfile:user=>{actor(user);return getCareerProductProfile(context,user);},saveProfile:(user,input)=>{actor(user);return saveCareerProductProfile(context,user,input);},
  };
 };
 return bind();
}