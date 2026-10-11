import { mongoCollections } from "@expresso/database";
import type { MongoContext } from "../../platform/mongodb.js";

/** 최초 replay와 live 송신은 동일한 소유자·생성 순서로 현재 제안을 선택합니다. */
export async function latestCareerProposal(context:MongoContext,userId:string,recordId:string) {
 return (await mongoCollections(context.db).careerAiProposals.find({userId,recordId}).sort({createdAt:-1,_id:-1}).limit(1).toArray())[0]??null;
}