import { API_PREFIX, WorkflowInputSchema, WorkflowReviewInputSchema, WorkflowDecisionSchema, WorkflowResponseSchema, WorkflowListResponseSchema, WorkflowOptionsResponseSchema } from "@expresso/contracts";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { z } from "zod";
import { HttpStatusError, requireAuth } from "../../api/plugins/auth-context.js";
import type { CareerWorkflowService } from "./service.js";
const Params = z.strictObject({ conversationId: z.uuid() }); const Run = Params.extend({ id: z.uuid() });
function parse<T>(schema: z.ZodType<T>, value: unknown) { const parsed = schema.safeParse(value); if (!parsed.success) throw new HttpStatusError(400, "작업 계획 입력을 확인하세요."); return parsed.data; }
export function registerCareerWorkflowRoutes(app: FastifyInstance, service: CareerWorkflowService, authenticateRequest: preHandlerHookHandler) {
 const base = `${API_PREFIX}/agent/conversations/:conversationId/workflows`; const config = { preHandler: authenticateRequest, bodyLimit: 64 * 1024 };
 app.get(base, config, async req => { const p = parse(Params, req.params); return WorkflowListResponseSchema.parse({ data: await service.list(requireAuth(req).user.id, p.conversationId) }); });
 app.get(`${base}/options`, config, async req => { const p = parse(Params, req.params); return WorkflowOptionsResponseSchema.parse({ data: await service.options(requireAuth(req).user.id, p.conversationId) }); });
 app.post(base, config, async req => { const p = parse(Params, req.params); return WorkflowResponseSchema.parse({ data: await service.create(requireAuth(req).user.id, p.conversationId, parse(WorkflowInputSchema, req.body)) }); });
 app.post(`${base}/:id/review`, config, async req => { const p = parse(Run, req.params); return WorkflowResponseSchema.parse({ data: await service.review(requireAuth(req).user.id, p.conversationId, p.id, parse(WorkflowReviewInputSchema, req.body)) }); });
 for (const action of ["advance", "cancel"] as const) app.post(`${base}/:id/${action}`, config, async req => { const p = parse(Run, req.params); const input = parse(WorkflowDecisionSchema, req.body); return WorkflowResponseSchema.parse({ data: await service[action](requireAuth(req).user.id, p.conversationId, p.id, input.expectedVersion) }); });
}
