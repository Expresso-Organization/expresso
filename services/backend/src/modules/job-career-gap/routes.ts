import { API_PREFIX, AnalyzeCareerGapSchema, CareerGapResponseSchema, GetCareerGapResponseSchema } from "@expresso/contracts";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { z } from "zod";
import { HttpStatusError, requireAuth } from "../../api/plugins/auth-context.js";
import type { CareerGapService } from "./service.js";
const Params = z.strictObject({ conversationId: z.uuid() });
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new HttpStatusError(400, "invalid gap request");
  return parsed.data;
}
export function registerCareerGapRoutes(app: FastifyInstance, options: { service: CareerGapService; authenticateRequest: preHandlerHookHandler }) {
  const path = `${API_PREFIX}/agent/conversations/:conversationId/career-gap`;
  const config = { preHandler: options.authenticateRequest, bodyLimit: 16 * 1024 };
  app.get(path, config, async (request) => {
    const user = requireAuth(request);
    const { conversationId } = parse(Params, request.params);
    return GetCareerGapResponseSchema.parse(await options.service.getLatest(user.user.id, conversationId));
  });
  app.post(path, config, async (request) => {
    const user = requireAuth(request);
    const { conversationId } = parse(Params, request.params);
    const input = parse(AnalyzeCareerGapSchema, request.body);
    return CareerGapResponseSchema.parse({ data: await options.service.analyze(user.user.id, conversationId, input) });
  });
}
