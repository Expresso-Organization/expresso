import { API_PREFIX, ApprovePreparationSchema, CreatePreparationSchema, PreparationListResponseSchema, PreparationResponseSchema, RejectPreparationSchema } from "@expresso/contracts";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { z } from "zod";
import { HttpStatusError, requireAuth } from "../../api/plugins/auth-context.js";
import type { PreparationService } from "./service.js";
const Conversation = z.strictObject({ conversationId: z.uuid() });
const Plan = Conversation.extend({ planId: z.uuid() });
function parse<T>(schema: z.ZodType<T>, value: unknown): T { const parsed = schema.safeParse(value); if (!parsed.success) throw new HttpStatusError(400, "invalid preparation request"); return parsed.data; }
export function registerPreparationRoutes(app: FastifyInstance, options: { service: PreparationService; authenticateRequest: preHandlerHookHandler }) {
  const base = `${API_PREFIX}/agent/conversations/:conversationId/preparation-plans`;
  const config = { preHandler: options.authenticateRequest, bodyLimit: 256 * 1024 };
  app.get(base, config, async (req) => { const { conversationId } = parse(Conversation, req.params); return PreparationListResponseSchema.parse(await options.service.list(requireAuth(req).user.id, conversationId)); });
  app.post(base, config, async (req) => { const { conversationId } = parse(Conversation, req.params); return PreparationResponseSchema.parse({ data: await options.service.create(requireAuth(req).user.id, conversationId, parse(CreatePreparationSchema, req.body)) }); });
  app.post(`${base}/:planId/approve`, config, async (req) => { const { conversationId, planId } = parse(Plan, req.params); return PreparationResponseSchema.parse({ data: await options.service.approve(requireAuth(req).user.id, conversationId, planId, parse(ApprovePreparationSchema, req.body)) }); });
  app.post(`${base}/:planId/reject`, config, async (req) => { const { conversationId, planId } = parse(Plan, req.params); return PreparationResponseSchema.parse({ data: await options.service.reject(requireAuth(req).user.id, conversationId, planId, parse(RejectPreparationSchema, req.body).expectedVersion) }); });
}
