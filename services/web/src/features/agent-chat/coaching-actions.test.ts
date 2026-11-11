import { beforeEach,it,expect,vi } from "vitest";
const mocks=vi.hoisted(()=>({request:vi.fn()}));
vi.mock('@/lib/require-session',()=>({requireSession:async()=>({accessToken:'test-token'})}));
vi.mock('@/lib/api/client',async original=>({...await original<typeof import('@/lib/api/client')>(),request:mocks.request}));
import { ApiError } from '@/lib/api/client';
import { coachingAction } from './coaching-actions';
beforeEach(()=>vi.resetAllMocks());
it('공통 409 문구보다 안전한 모듈 안내를 표시한다',async()=>{
 mocks.request.mockRejectedValue(new ApiError({status:409,code:'CONFLICT',requestId:'test',message:'Request conflicts with current state',details:{coachingMessage:'아직 배포 이력이 없습니다.'}}));
 expect(await coachingAction(crypto.randomUUID(),'analytics',{expectedVersion:0,portfolioId:crypto.randomUUID(),period:'30d'})).toEqual({ok:false,error:'아직 배포 이력이 없습니다.'});
});
it('500 오류의 내부 상세 내용을 노출하지 않는다',async()=>{
 mocks.request.mockRejectedValue(new ApiError({status:500,code:'INTERNAL_ERROR',requestId:'test',message:'private',details:{coachingMessage:'private'}}));
 expect(JSON.stringify(await coachingAction(crypto.randomUUID(),'load'))).not.toContain('private');
});
it('조회 대기 시간 초과에는 결과 재확인을 안내한다',async()=>{
 mocks.request.mockRejectedValue(Object.assign(new Error('timeout'),{name:'TimeoutError'}));
 const result=await coachingAction(crypto.randomUUID(),'load');expect(result.ok).toBe(false);if(!result.ok)expect(result.error).toContain('저장 상태를 다시 불러와');
 expect(mocks.request.mock.calls[0]?.[2]?.signal).toBeInstanceOf(AbortSignal);
});
