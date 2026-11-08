import { describe,it,expect,vi } from "vitest";
import { randomUUID } from "node:crypto";
vi.mock("../../platform/mongo-transaction.js",()=>({inTransaction:async(db:unknown,fn:(tx:unknown)=>unknown)=>fn(db)}));
vi.mock("../identity/index.js",()=>({requireActiveUser:vi.fn(async()=>undefined)}));
import { CareerCoachingService } from "./service.js";
import type { MongoContext } from "../../platform/mongodb.js";
import { dashboard } from "./test-fixture.js";
function setup(){let row: any=null;const rows={findOne:vi.fn(async(f:any)=>row?._id===f._id?structuredClone(row):null),updateOne:vi.fn(async(f:any,u:any,o:any)=>{if(!row){if(!o.upsert)return {matchedCount:0,upsertedCount:0};row={_id:f._id,userId:f.userId,state:u.$set.state};return {matchedCount:0,upsertedCount:1};}if(row._id===f._id&&row.state.version===f['state.version']){row.state=structuredClone(u.$set.state);return {matchedCount:1,upsertedCount:0};}if(o.upsert)throw Object.assign(new Error(),{code:11000});return {matchedCount:0,upsertedCount:0};})};
 const db={db:{collection:()=>rows}} as unknown as MongoContext;const agent={get:vi.fn(async()=>({}))};const analytics={dashboard:vi.fn(async()=>d)};const d=dashboard();const service=new CareerCoachingService(db,agent as never,analytics as never);return {service,rows,agent,analytics,d,user:randomUUID(),conversation:randomUUID()};}
const profile={experience:"API 구현",interests:"서버",constraints:"서울",weeklyHours:3};
describe("개인화 저장·승인 경계",()=>{
 it("다른 사용자 대화 접근은 저장 전 거절한다",async()=>{const x=setup();x.agent.get.mockRejectedValue(Error("not owned"));await expect(x.service.explore(x.user,x.conversation,0,profile)).rejects.toThrow("not owned");expect(x.rows.updateOne).not.toHaveBeenCalled();});
 it("프로필 저장 후 다른 대화에서 같은 사용자 설정을 읽는다",async()=>{const x=setup();await x.service.explore(x.user,x.conversation,0,profile);expect((await x.service.get(x.user,randomUUID())).profile).toEqual(profile);});
 it("두 탭의 예전 버전 저장을 차단한다",async()=>{const x=setup();await x.service.explore(x.user,x.conversation,0,profile);await expect(x.service.explore(x.user,x.conversation,0,profile)).rejects.toMatchObject({statusCode:409});});
 it("다른 사용자는 개인화 상태를 읽을 수 없다",async()=>{const x=setup();await x.service.explore(x.user,x.conversation,0,profile);expect((await x.service.get(randomUUID(),x.conversation)).profile).toBeNull();});
 it("피드백 중지를 저장한다",async()=>{const x=setup();const f={id:randomUUID(),kind:"plan" as const,target:"주말 일정",reason:"시간 부족",active:true};await x.service.feedback(x.user,x.conversation,0,f);const s=await x.service.feedback(x.user,x.conversation,1,{...f,active:false});expect(s.appliedFeedback).toEqual([]);expect(s.feedback).toHaveLength(1);});
 it("다른 사용자의 포트폴리오 분석은 거절한다",async()=>{const x=setup();x.analytics.dashboard.mockRejectedValue(Error("not owned"));await expect(x.service.analyticsDraft(x.user,x.conversation,0,x.d.portfolio.id,"30d")).rejects.toThrow("not owned");expect(x.rows.updateOne).not.toHaveBeenCalled();});
 it("승인 전에 후속 작업을 만들지 않고 승인 상태만 저장한다",async()=>{const x=setup();const s=await x.service.analyticsDraft(x.user,x.conversation,0,x.d.portfolio.id,"30d");expect(s.improvements.every(p=>p.status==="pending")).toBe(true);const approved=await x.service.decide(x.user,x.conversation,1,s.improvements[0]!.id,"approved");expect(approved.improvements[0]?.status).toBe("approved");expect(x.analytics.dashboard).toHaveBeenCalledTimes(2);});
 it("지표 변경 뒤 이전 초안 승인을 막는다",async()=>{const x=setup();const s=await x.service.analyticsDraft(x.user,x.conversation,0,x.d.portfolio.id,"30d");x.d.metrics.visits++;await expect(x.service.decide(x.user,x.conversation,1,s.improvements[0]!.id,"approved")).rejects.toMatchObject({statusCode:409});});
 it("거절 후 중복 승인할 수 없다",async()=>{const x=setup();const s=await x.service.analyticsDraft(x.user,x.conversation,0,x.d.portfolio.id,"30d");await x.service.decide(x.user,x.conversation,1,s.improvements[0]!.id,"rejected");await expect(x.service.decide(x.user,x.conversation,2,s.improvements[0]!.id,"approved")).rejects.toMatchObject({statusCode:409});});
});

it("미배포 안내를 공개 가능한 모듈 오류로 변환한다",async()=>{
 const {AnalyticsError}=await import('../analytics/index.js');const x=setup();x.analytics.dashboard.mockRejectedValue(new AnalyticsError(409,'portfolio has never been published'));
 await expect(x.service.analyticsDraft(x.user,x.conversation,0,x.d.portfolio.id,'30d')).rejects.toMatchObject({statusCode:409,publicDetails:{coachingMessage:expect.stringContaining('배포 이력이 없는')}});
 expect(x.rows.updateOne).not.toHaveBeenCalled();
});
it("집계·표본 부족과 버전 충돌의 상세 안내를 구분한다",async()=>{
 const x=setup();x.d.insight={state:'insufficient_sample',sampleSize:1,minimumSample:30};
 await expect(x.service.analyticsDraft(x.user,x.conversation,0,x.d.portfolio.id,'30d')).rejects.toMatchObject({publicDetails:{coachingMessage:expect.stringContaining('방문 표본')}});
 await x.service.explore(x.user,x.conversation,0,profile);
 await expect(x.service.explore(x.user,x.conversation,0,profile)).rejects.toMatchObject({publicDetails:{coachingMessage:expect.stringContaining('다른 화면')}});
});
