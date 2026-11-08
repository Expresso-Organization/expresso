import { API_PREFIX, CoachingResponseSchema, CoachingExploreSchema, CoachingFeedbackInputSchema, CoachingAnalyticsInputSchema, CoachingDecisionSchema } from "@expresso/contracts";
import { z } from "zod";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { HttpStatusError, requireAuth } from "../../api/plugins/auth-context.js";
import type { CareerCoachingService } from "./service.js";
function parse<T>(schema:z.ZodType<T>,value:unknown):T { const r=schema.safeParse(value);if(!r.success)throw new HttpStatusError(400,"입력 내용을 확인하세요.");return r.data; }
export function registerCareerCoachingRoutes(app:FastifyInstance,service:CareerCoachingService,authenticate:preHandlerHookHandler) {
 const base=`${API_PREFIX}/agent/conversations/:conversationId/coaching`;const config={preHandler:authenticate,bodyLimit:32*1024};
 const identity=(req:Parameters<typeof requireAuth>[0])=>({userId:requireAuth(req).user.id,conversationId:parse(z.object({conversationId:z.uuid()}),req.params).conversationId});
 app.get(base,config,async req=>{const p=identity(req);return CoachingResponseSchema.parse({data:await service.get(p.userId,p.conversationId)});});
 app.post(`${base}/explore`,config,async req=>{const p=identity(req),b=parse(CoachingExploreSchema,req.body);return CoachingResponseSchema.parse({data:await service.explore(p.userId,p.conversationId,b.expectedVersion,b.profile)});});
 app.post(`${base}/feedback`,config,async req=>{const p=identity(req),b=parse(CoachingFeedbackInputSchema,req.body);return CoachingResponseSchema.parse({data:await service.feedback(p.userId,p.conversationId,b.expectedVersion,b.feedback)});});
 app.post(`${base}/analytics`,config,async req=>{const p=identity(req),b=parse(CoachingAnalyticsInputSchema,req.body);return CoachingResponseSchema.parse({data:await service.analyticsDraft(p.userId,p.conversationId,b.expectedVersion,b.portfolioId,b.period)});});
 app.post(`${base}/decision`,config,async req=>{const p=identity(req),b=parse(CoachingDecisionSchema,req.body);return CoachingResponseSchema.parse({data:await service.decide(p.userId,p.conversationId,b.expectedVersion,b.id,b.decision)});});
}
