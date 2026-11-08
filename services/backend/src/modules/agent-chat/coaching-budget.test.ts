import { randomUUID } from "node:crypto";
import { it,expect } from "vitest";
import { AgentChatService } from "./service.js";
import { emptyCoaching } from "../career-coaching/service.js";
import type { MongoContext } from "../../platform/mongodb.js";
it("저장한 가용 시간을 초과하는 계획과 재계획 도구를 차단한다",async()=>{
 const state={...emptyCoaching(),profile:{experience:"API",interests:"서버",constraints:"",weeklyHours:2}};
 const db={db:{collection:()=>({findOne:async()=>({state})})}} as unknown as MongoContext;
 const service=new AgentChatService(db,null,{} as never,{} as never,{} as never,{} as never);
 const tools=service as unknown as {planDraft(userId:string,messages:unknown[],input:unknown):Promise<unknown>;replanDraft(userId:string,input:unknown):Promise<unknown>};
 const settings={weeklyHours:5,weeks:4,startDate:"2026-11-09"};
 await expect(tools.planDraft(randomUUID(),[],{gapIndexes:[0],settings})).rejects.toThrow("주 2시간");
 await expect(tools.replanDraft(randomUUID(),{planId:randomUUID(),settings})).rejects.toThrow("2시간");
});
