import {latestCareerProposal} from "./proposal-order.js";
import {CareerSocketServerMessageSchema} from "@expresso/contracts";
import {mongoCollections} from "@expresso/database";
import type {MongoContext} from "../../platform/mongodb.js";
import type {InMemoryCareerDocumentSessionRegistry} from "./session-registry.js";
import {binaryBytes,hashUpdate} from "./repository.js";

/** Worker commit 뒤 공개 송신이 유실돼도 Mongo update 원장을 다시 읽어 현재 연결에 전달합니다. */
export function createCareerDocumentDelivery(context:MongoContext,registry:Pick<InMemoryCareerDocumentSessionRegistry,"activeRecords"|"publishOwned">,options:{intervalMs?:number;onError?:(error:unknown)=>void}={}) {
 const intervalMs=options.intervalMs??500;if(!Number.isSafeInteger(intervalMs)||intervalMs<25)throw new RangeError("document delivery interval is invalid");
 const cursors=new Map<string,number>(),proposals=new Map<string,string>();let offset=0,active=false,timer:ReturnType<typeof setTimeout>|undefined,inFlight:Promise<{updates:number;proposals:number}>|undefined;
 async function sweep(){
  const subscriptions=registry.activeRecords(),keys=new Set(subscriptions.map(row=>row.userId+":"+row.recordId));
  for(const key of cursors.keys())if(!keys.has(key))cursors.delete(key);
  for(const key of proposals.keys())if(!keys.has(key))proposals.delete(key);
  if(!subscriptions.length)return{updates:0,proposals:0};
  const db=mongoCollections(context.db);let updates=0,proposalCount=0;
  for(let index=0;index<Math.min(25,subscriptions.length);index++){
   const subscription=subscriptions[(offset+index)%subscriptions.length]!,{userId,recordId}=subscription,key=userId+":"+recordId;
   if(!await db.users.findOne({_id:userId,deletionRequestedAt:null})||!await db.careerRecords.findOne({_id:recordId,userId,deletedAt:null}))continue;
   const after=cursors.get(key)??subscription.afterSequence;
   // 압축된 update도 인과 원장의 일부입니다. 활성 연결의 cursor는 성공한 송신 뒤에만 움직입니다.
   const rows=await db.careerDocumentUpdates.find({userId,recordId,serverSequence:{$gt:after}}).sort({serverSequence:1}).limit(50).toArray();
   for(const row of rows){
    const bytes=binaryBytes(row.update);if(bytes.byteLength!==row.byteLength||bytes.byteLength>1048576||hashUpdate(bytes)!==row.updateHash)throw new Error("durable document update integrity is invalid");
    const message=CareerSocketServerMessageSchema.parse({type:"update",protocolVersion:1,recordId,sessionId:"00000000-0000-0000-0000-000000000000",sequence:row.serverSequence,updateBase64:Buffer.from(bytes).toString("base64"),actor:row.actor});
    registry.publishOwned(userId,recordId,message);cursors.set(key,row.serverSequence);updates++;
   }
   // 현재 제안만 재전달하여 이전 history가 새 제안을 덮어쓰지 않도록 합니다.
   const current=await latestCareerProposal(context,userId,recordId); const pending=current?[current]:[];
   for(const proposal of pending){
    const identity=key,revision=JSON.stringify([subscription.connectionIds,proposal._id,proposal.updatedAt,proposal.status,proposal.progress]);if(proposals.get(identity)===revision)continue;
    const message=CareerSocketServerMessageSchema.parse({type:"proposal",protocolVersion:1,recordId,sessionId:"00000000-0000-0000-0000-000000000000",proposalId:proposal._id,createdAt:proposal.createdAt.toISOString(),baseDocumentVersion:proposal.baseDocumentVersion,status:proposal.status,progress:proposal.progress});
    registry.publishOwned(userId,recordId,message);proposals.set(identity,revision);proposalCount++;
   }
  }
  offset=(offset+25)%subscriptions.length;return{updates,proposals:proposalCount};
 }
 const pollOnce=()=>inFlight??=sweep().finally(()=>{inFlight=undefined;});
 const tick=async()=>{try{await pollOnce();}catch(error){options.onError?.(error);}finally{if(active)timer=setTimeout(()=>{void tick();},intervalMs);}};
 return{pollOnce,start(){if(active)return;active=true;void tick();},async stop(){active=false;if(timer)clearTimeout(timer);await inFlight?.catch(()=>{});}};
}