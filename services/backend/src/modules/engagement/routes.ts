import { API_PREFIX, NotificationKindSchema, NotificationPreferenceSchema, UnifiedSearchQuerySchema } from "@expresso/contracts";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { z } from "zod";

import { HttpStatusError, requireAuth } from "../../api/plugins/auth-context.js";
import { type EngagementApi } from "./index.js";

const KindParams = z.strictObject({ kind: NotificationKindSchema });

export function registerEngagementRoutes(app: FastifyInstance, options: { service: EngagementApi; authenticateRequest: preHandlerHookHandler }) {
  app.get(`${API_PREFIX}/notification-preferences`, { preHandler: options.authenticateRequest }, async (request) => ({ data: await options.service.preferences(requireAuth(request).user.id) }));
  app.put(`${API_PREFIX}/notification-preferences/:kind`, { preHandler: options.authenticateRequest }, async (request) => {
    const user = requireAuth(request).user;
    const params = KindParams.safeParse(request.params);
    const body = NotificationPreferenceSchema.pick({ enabled: true }).safeParse(request.body);
    if (!params.success || !body.success) throw new HttpStatusError(400, "invalid notification preference");
    return { data: await options.service.setPreference(user.id, params.data.kind, body.data.enabled) };
  });
  app.get(`${API_PREFIX}/notifications`, { preHandler: options.authenticateRequest }, async (request) => ({ data: await options.service.listNotifications(requireAuth(request).user.id) }));
  app.get(`${API_PREFIX}/home`, { preHandler: options.authenticateRequest }, async (request) => ({ data: await options.service.home(requireAuth(request).user.id) }));
  app.get(`${API_PREFIX}/search`, { preHandler: options.authenticateRequest }, async (request) => {
    const query = UnifiedSearchQuerySchema.safeParse(request.query);
    if (!query.success) throw new HttpStatusError(400, "invalid search query");
    return options.service.search(requireAuth(request).user.id, query.data);
  });
}

