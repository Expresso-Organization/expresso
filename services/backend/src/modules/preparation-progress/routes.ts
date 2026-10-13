import { API_PREFIX, CreateReplanSchema, ProgressResponseSchema, ReplanDecisionSchema, ReplanListResponseSchema, ReplanResponseSchema, UpdateTaskProgressSchema } from "@expresso/contracts";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { z } from "zod";
import { requireAuth, HttpStatusError } from "../../api/plugins/auth-context.js";
import type { PreparationProgressService } from "./service.js";
const Plan = z.strictObject({ conversationId: z.uuid(), planId: z.uuid() }); const Task = Plan.extend({ taskId: z.uuid() }); const Replan = Plan.extend({ replanId: z.uuid() });
function parse<T>(schema: z.ZodType<T>, value: unknown): T { const parsed = schema.safeParse(value); if (!parsed.success) throw new HttpStatusError(400, "invalid progress request"); return parsed.data; }
export function registerPreparationProgressRoutes(app: FastifyInstance, options: { service: PreparationProgressService; authenticateRequest: preHandlerHookHandler }) {
  const base = `${API_PREFIX}/agent/conversations/:conversationId/preparation-plans/:planId/progress`; const config = { preHandler: options.authenticateRequest, bodyLimit: 32 * 1024 };
  app.get(base, config, async (req) => { const p = parse(Plan, req.params); return ProgressResponseSchema.parse({ data: await options.service.get(requireAuth(req).user.id, p.conversationId, p.planId) }); });
  app.post(base, config, async (req) => { const p = parse(Plan, req.params); return ProgressResponseSchema.parse({ data: await options.service.start(requireAuth(req).user.id, p.conversationId, p.planId) }); });
  app.patch(`${base}/tasks/:taskId`, config, async (req) => { const p = parse(Task, req.params); return ProgressResponseSchema.parse({ data: await options.service.update(requireAuth(req).user.id, p.conversationId, p.planId, p.taskId, parse(UpdateTaskProgressSchema, req.body)) }); });
  app.get(`${base}/replans`, config, async (req) => { const p = parse(Plan, req.params); return ReplanListResponseSchema.parse({ data: await options.service.listReplans(requireAuth(req).user.id, p.conversationId, p.planId) }); });
  app.post(`${base}/replans`, config, async (req) => { const p = parse(Plan, req.params); return ReplanResponseSchema.parse({ data: await options.service.createReplan(requireAuth(req).user.id, p.conversationId, p.planId, parse(CreateReplanSchema, req.body)) }); });
  for (const action of ["approve", "reject"] as const) app.post(`${base}/replans/:replanId/${action}`, config, async (req) => { const p = parse(Replan, req.params); return ReplanResponseSchema.parse({ data: await options.service.decideReplan(requireAuth(req).user.id, p.conversationId, p.planId, p.replanId, parse(ReplanDecisionSchema, req.body).expectedVersion, action) }); });
}
