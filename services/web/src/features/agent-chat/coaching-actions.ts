"use server";
import { z } from "zod";
import { CoachingResponseSchema, CoachingExploreSchema, CoachingFeedbackInputSchema, CoachingAnalyticsInputSchema, CoachingDecisionSchema } from "@expresso/contracts";
import { ApiError, request } from "@/lib/api/client";
import { requireSession } from "@/lib/require-session";
export async function coachingAction(conversationId: string, action: "load"|"explore"|"feedback"|"analytics"|"decision", value?: unknown) {
 const session=await requireSession();
 try {
 const base=`/v1/agent/conversations/${z.uuid().parse(conversationId)}/coaching`;
 const schemas={explore:CoachingExploreSchema,feedback:CoachingFeedbackInputSchema,analytics:CoachingAnalyticsInputSchema,decision:CoachingDecisionSchema};
 if(action!=="load" && !Object.hasOwn(schemas,action))throw new Error("invalid action");
 const signal=AbortSignal.timeout(30_000);
 const response=action==="load" ? await request(base,CoachingResponseSchema,{accessToken:session.accessToken,cache:"no-store",signal}) : await request(`${base}/${action}`,CoachingResponseSchema,{method:"POST",body:schemas[action].parse(value),accessToken:session.accessToken,signal});
 return {ok:true as const,data:response.data};
 }catch(error){
 const detail=error instanceof ApiError && error.status<500 ? error.details?.["coachingMessage"] : undefined;
 const message=typeof detail==="string" ? detail : error instanceof ApiError && error.status<500 ? error.message : error instanceof Error && ["TimeoutError","AbortError"].includes(error.name) ? "요청 응답을 기다리는 시간이 초과됐습니다. 저장 상태를 다시 불러와 결과를 확인하세요." : "처리하지 못했습니다. 다시 불러와 저장 상태를 확인하세요.";
 return {ok:false as const,error:message};
 }
}
