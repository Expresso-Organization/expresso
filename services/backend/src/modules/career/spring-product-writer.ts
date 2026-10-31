import type { CareerRecord,CareerBusinessRecordResponse,CareerWriterCreate,CareerWriterPatch,CareerWriterMove,CareerWriterRelation } from "@expresso/contracts";
import { createSpringCareerCommandFacade,SpringCareerCommandError } from "./spring-command-facade.js";
import { CareerDeleteImpactSchema } from "@expresso/contracts";
import { CareerError } from "./errors.js";
export interface CareerProductCommandReads {
 getRecord(userId:string,recordId:string):Promise<CareerRecord>;
 version(userId:string,recordId:string,trashed:boolean):Promise<number>;
 deleteImpact(userId:string,recordId:string):Promise<ReturnType<typeof CareerDeleteImpactSchema.parse>>;
}
/** 제품 facade는 owner 명령과 읽기만 제공하며 Mongo write port를 갖지 않습니다. */
export class SpringCareerProductWriter {
 private readonly commands:ReturnType<typeof createSpringCareerCommandFacade>;
 constructor(baseUrl:string,private readonly reads:CareerProductCommandReads,transport?:(url:string,init:RequestInit)=>Promise<Response>) {
  this.commands=createSpringCareerCommandFacade(baseUrl,transport);
 }
 private async owner<T>(action:()=>Promise<T>):Promise<T> {
  try{return await action();}
  catch(error) {
   if(error instanceof SpringCareerCommandError)throw new CareerError(error.status,"Career business owner rejected the command",error.response.error.details);
   throw new CareerError(503,"Career business owner is unavailable");
  }
 }
 private async product(userId:string,response:CareerBusinessRecordResponse,recordId?:string):Promise<CareerRecord> {
  if(response.data.userId!==userId||(recordId!==undefined&&response.data.id!==recordId))throw new CareerError(503,"Career business owner response binding mismatch");
  return this.reads.getRecord(userId,response.data.id);
 }
 async create(token:string,userId:string,key:string,input:CareerWriterCreate) {
  const result=await this.owner(()=>this.commands.createWithStatus(token,key,input));
  if(result.body.data.categoryId!==input.categoryId)throw new CareerError(503,"Career business owner response binding mismatch");
  return {record:await this.product(userId,result.body),created:result.created};
 }
 async patch(token:string,userId:string,recordId:string,version:number,input:CareerWriterPatch) {
  return this.product(userId,await this.owner(()=>this.commands.patch(token,recordId,version,input)),recordId);
 }
 async trash(token:string,userId:string,recordId:string,expectedVersion?:number) {
  const version=expectedVersion??await this.reads.version(userId,recordId,false),impact=await this.reads.deleteImpact(userId,recordId);
  const response=await this.owner(()=>this.commands.trash(token,recordId,version));
  if(response.data.userId!==userId||response.data.id!==recordId)throw new CareerError(503,"Career business owner response binding mismatch");
  return impact;
 }
 async restore(token:string,userId:string,recordId:string,expectedVersion?:number) {
  const version=expectedVersion??await this.reads.version(userId,recordId,true);
  return this.product(userId,await this.owner(()=>this.commands.restore(token,recordId,version)),recordId);
 }
 async relation(token:string,userId:string,recordId:string,version:number,input:CareerWriterRelation) {
  return this.product(userId,await this.owner(()=>this.commands.relation(token,recordId,version,input)),recordId);
 }
 async move(token:string,userId:string,recordId:string,version:number,input:CareerWriterMove) {
  return this.product(userId,await this.owner(()=>this.commands.move(token,recordId,version,input)),recordId);
 }
 async createLink(token:string,userId:string,recordId:string,toRecordId:string,relation:"related"|"parent"|"duplicate_of") {
  if(recordId===toRecordId)throw new CareerError(400,"record cannot link itself");
  await this.reads.getRecord(userId,recordId);await this.reads.getRecord(userId,toRecordId);
  const version=await this.reads.version(userId,recordId,false),result=await this.owner(()=>this.commands.createLink(token,recordId,version,{toRecordId,relation}));
  if(result.recordId!==recordId || result.relatedRecordId!==toRecordId || result.relation!==relation || (relation==="parent" && result.direction!=="outgoing"))throw new CareerError(503,"Career business owner response binding mismatch");
  return {id:result.id,from_record_id:result.direction==="outgoing"?recordId:toRecordId,to_record_id:result.direction==="outgoing"?toRecordId:recordId,relation:result.relation};
 }
 async listLinks(token:string,userId:string,recordId:string) {
  await this.reads.getRecord(userId,recordId);const result=await this.owner(()=>this.commands.listLinks(token,recordId));
  if(result.some(item=>item.recordId!==recordId))throw new CareerError(503,"Career business owner response binding mismatch");return result;
 }
 async previewMove(token:string,userId:string,recordId:string,version:number,targetCategoryId:string) {
  await this.reads.getRecord(userId,recordId);
  return this.owner(()=>this.commands.previewMove(token,recordId,version,targetCategoryId));
 }
}
