import {CareerProfileSchema,SaveCareerProfileSchema,type CreateCareerCategory,type SaveCareerProfile} from "@expresso/contracts";
import {mongoCollections} from "@expresso/database";
import type {MongoContext} from "../../platform/mongodb.js";
import {inTransaction} from "../../platform/mongo-transaction.js";
import {requireActiveUser} from "../identity/index.js";
import {CareerError} from "./errors.js";
import {requireCareerCategory} from "./mongo-categories.js";
import {CareerService} from "./service.js";
/** 카테고리 생성은 main의 소유권·개수·정렬·V2 정의 검사를 그대로 사용합니다. */
export function createCanonicalCareerCategory(context:MongoContext,userId:string,input:CreateCareerCategory){return new CareerService(context).createCategory(userId,input);}
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