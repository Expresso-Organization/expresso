import Fastify from "fastify";
import { afterEach,it,expect,vi } from "vitest";
import { randomUUID } from "node:crypto";
import { registerCareerCoachingRoutes } from "./routes.js";
import type { CareerCoachingService } from "./service.js";
const apps:ReturnType<typeof Fastify>[]=[];afterEach(async()=>{await Promise.all(apps.splice(0).map(app=>app.close()));});
function setup(){const app=Fastify();apps.push(app);const get=vi.fn(async()=>({version:0,profile:null,candidates:[],feedback:[],appliedFeedback:[],improvements:[]}));const explore=vi.fn();registerCareerCoachingRoutes(app,{get,explore} as unknown as CareerCoachingService,async req=>{if(req.headers.authorization)req.auth={user:{id:randomUUID()}} as never;});return {app,get,explore,path:`/v1/agent/conversations/${randomUUID()}/coaching`};}
it('인증 없이 개인화 상태를 읽지 못한다',async()=>{const x=setup();expect((await x.app.inject({url:x.path})).statusCode).toBe(401);expect(x.get).not.toHaveBeenCalled();});
it('시간 범위를 벗어난 요청은 서비스 호출 전에 거절한다',async()=>{const x=setup();const response=await x.app.inject({url:`${x.path}/explore`,method:'POST',headers:{authorization:'Bearer test'},payload:{expectedVersion:0,profile:{experience:'API',interests:'서버',constraints:'',weeklyHours:100}}});expect(response.statusCode).toBe(400);expect(x.explore).not.toHaveBeenCalled();});
it('기존 인증 문맥의 사용자와 대화 ID로 읽는다',async()=>{const x=setup();const response=await x.app.inject({url:x.path,headers:{authorization:'Bearer test'}});expect(response.statusCode).toBe(200);expect(x.get).toHaveBeenCalledTimes(1);expect(response.json().data.version).toBe(0);});

it('공통 오류 처리기를 거쳐도 안전한 coaching 안내가 유지된다',async()=>{
 const {registerErrorHandler}=await import('../../api/error-handler.js');
 const {CoachingError}=await import('./service.js');
 const app=Fastify();apps.push(app);registerErrorHandler(app);
 registerCareerCoachingRoutes(app,{get:async()=>{throw new CoachingError(409,'아직 배포 이력이 없는 포트폴리오입니다.');}} as unknown as CareerCoachingService,async req=>{req.auth={user:{id:randomUUID()}} as never;});
 const response=await app.inject({url:`/v1/agent/conversations/${randomUUID()}/coaching`});
 expect(response.statusCode).toBe(409);
 expect(response.json().error.message).toBe('Request conflicts with current state');
 expect(response.json().error.details.coachingMessage).toContain('배포 이력이 없는');
});
