import { randomUUID } from "node:crypto";
import { MongoClient } from "mongodb";
import { describe,it,expect,vi } from "vitest";
import { loadMongoMigrations } from "@expresso/database";
import { CareerCoachingService,readCoaching } from "./service.js";
import { dashboard } from "./test-fixture.js";
const uri=process.env.TEST_MONGODB_URL;
async function fixture(test:(x:{service:CareerCoachingService;userId:string;conversationId:string;db:ReturnType<MongoClient['db']>;client:MongoClient})=>Promise<void>){
 const client=await new MongoClient(uri!).connect();const db=client.db(`expresso_coaching_test_${randomUUID().replaceAll('-','')}`);const userId=randomUUID(),conversationId=randomUUID();
 try{for(const step of (await loadMongoMigrations()).find(m=>m.version==='0027')!.steps)await step.run(db);
 await db.collection('users').insertOne({_id:userId,deletionRequestedAt:null} as never);
 const agent={get:vi.fn(async(user:string,id:string)=>{if(user!==userId||id!==conversationId)throw Error('not owned');return {} as never;})};
 const analytics={dashboard:vi.fn(async()=>dashboard())};
 await test({service:new CareerCoachingService({client,db},agent,analytics as never),userId,conversationId,db,client});
 }finally{try{await db.dropDatabase();}finally{await client.close();}}
}
const profile={experience:'API 구현',interests:'서버',constraints:'서울',weeklyHours:3};
describe.skipIf(!uri)('P16~P18 실제 MongoDB 저장',()=>{
 it('트랜잭션 저장과 재조회·사용자 격리',async()=>fixture(async x=>{await x.service.explore(x.userId,x.conversationId,0,profile);expect((await readCoaching({db:x.db,client:x.client},x.userId)).profile).toEqual(profile);expect((await readCoaching({db:x.db,client:x.client},randomUUID())).profile).toBeNull();}));
 it('동시 첫 저장은 한 번만 성공한다',async()=>fixture(async x=>{const result=await Promise.allSettled([x.service.explore(x.userId,x.conversationId,0,profile),x.service.explore(x.userId,x.conversationId,0,profile)]);expect(result.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(await x.db.collection('career_coaching').countDocuments()).toBe(1);}));
 it('삭제 대기 계정에는 새 설정을 저장하지 않는다',async()=>fixture(async x=>{await x.db.collection('users').updateOne({_id:x.userId} as never,{$set:{deletionRequestedAt:new Date()}});await expect(x.service.explore(x.userId,x.conversationId,0,profile)).rejects.toThrow('pending deletion');expect(await x.db.collection('career_coaching').countDocuments()).toBe(0);}));
});
