import {randomUUID} from "node:crypto";
import {CreateCareerCategorySchema,CreateCareerViewSchema,CareerProfileSchema,SaveCareerProfileSchema,type CreateCareerCategory,type CreateCareerView,type SaveCareerProfile} from "@expresso/contracts";
import {mongoCollections,prepareCanonicalCareerCategory,type CareerCategoryDoc,type CareerViewDoc} from "@expresso/database";
import type {MongoContext} from "../../platform/mongodb.js";
import {inTransaction} from "../../platform/mongo-transaction.js";
import {requireActiveUser} from "../identity/index.js";
import {CareerError} from "./errors.js";
import {mapMongoCategory,mapMongoView,requireCareerCategory} from "./mongo-categories.js";
const duplicate=(error:unknown)=>(error as {code?:number})?.code===11000;
/** 새 범주는 값을 쓰기 전에 canonical 정의를 함께 준비합니다. */
export async function createCanonicalCareerCategory(context:MongoContext,userId:string,raw:CreateCareerCategory){
 const input=CreateCareerCategorySchema.parse(raw);
 try{return await inTransaction(context,async tx=>{
  await requireActiveUser(tx,userId);const categories=mongoCollections(tx.db).careerCategories,count=await categories.countDocuments({userId},{session:tx.session});
  if(count>=100)throw new CareerError(409,"career category limit exceeded");
  const propertySchema=Object.fromEntries(Object.entries(input.propertySchema).map(([key,definition])=>[key,{...definition,id:definition.id??randomUUID()}]));
  const category:CareerCategoryDoc={_id:randomUUID(),userId,...input,propertySchema,isSystem:false,sortOrder:7+count,version:1,updatedAt:new Date()};
  const prepared=prepareCanonicalCareerCategory(category);if(prepared.conflicts.length)throw new CareerError(400,"invalid canonical Career category",{reason:prepared.conflicts[0]!.code});
  Object.assign(category,prepared.set);await categories.insertOne(category,{session:tx.session});return mapMongoCategory(category);
 });}catch(error){if(duplicate(error))throw new CareerError(409,"career category key already exists");throw error;}
}
/** 이전 뷰 API도 업무 값이 아닌 설정만 저장하고 canonical 정의를 참조합니다. */
export async function createCareerLegacyViewMetadata(context:MongoContext,userId:string,categoryId:string,raw:CreateCareerView){
 const input=CreateCareerViewSchema.parse(raw);
 try{return await inTransaction(context,async tx=>{
  await requireActiveUser(tx,userId);const category=await requireCareerCategory(tx,userId,categoryId,tx.session);
  if(!category.propertySchemaV2||!category.schemaVersion)throw new CareerError(409,"CANONICAL_SCHEMA_NOT_PREPARED");
  const definitions=category.propertySchemaV2.filter(definition=>definition.deletedAt===null),allowed=new Set(["title","status",...definitions.map(definition=>definition.key)]);
  for(const key of [...input.filters.map(item=>item.property),...input.sorts.map(item=>item.property),...input.visibleProperties])if(!allowed.has(key))throw new CareerError(400,"view references an unknown property");
  if(input.viewType==="timeline"&&!definitions.some(definition=>definition.type==="date"||(!definition.system&&["created_time","updated_time"].includes(definition.type))))throw new CareerError(400,"timeline views require a date property");
  const views=mongoCollections(tx.db).careerViews,count=await views.countDocuments({userId,categoryId},{session:tx.session});if(count>=8)throw new CareerError(409,"category view limit exceeded");
  const view:CareerViewDoc={_id:randomUUID(),userId,categoryId,...input,filters:input.filters.map(({property,operator,value})=>value===undefined?{property,operator}:{property,operator,value}),sortOrder:count,createdAt:new Date()};
  await views.insertOne(view,{session:tx.session});return mapMongoView(view);
 });}catch(error){if(duplicate(error))throw new CareerError(409,"career view name already exists");throw error;}
}
export async function listCareerLegacyViewMetadata(context:MongoContext,userId:string,categoryId:string){
 await requireCareerCategory(context,userId,categoryId);return(await mongoCollections(context.db).careerViews.find({userId,categoryId}).sort({sortOrder:1,_id:1}).limit(100).toArray()).map(mapMongoView);
}
export async function readCareerProductRecordVersion(context:MongoContext,userId:string,recordId:string,trashed:boolean){
 const row=await mongoCollections(context.db).careerRecords.findOne({_id:recordId,userId,deletedAt:trashed?{$ne:null}:null});
 if(!row)throw new CareerError(404,"career record not found");await requireCareerCategory(context,userId,row.categoryId);return row.version;
}
export async function getCareerProductProfile(context:MongoContext,userId:string){
 const user=await mongoCollections(context.db).users.findOne({_id:userId});return user?.profile?CareerProfileSchema.parse({...user.profile,updatedAt:user.profile.updatedAt.toISOString()}):null;
}
export async function saveCareerProductProfile(context:MongoContext,userId:string,raw:SaveCareerProfile){
 const input=SaveCareerProfileSchema.parse(raw);return inTransaction(context,async tx=>{
  await requireActiveUser(tx,userId);const profile={...input,targetRoles:[...new Set(input.targetRoles)],updatedAt:new Date()};
  await mongoCollections(tx.db).users.updateOne({_id:userId},{$set:{profile}},{session:tx.session});return CareerProfileSchema.parse({...profile,updatedAt:profile.updatedAt.toISOString()});
 });
}