import {
  AddWidgetSchema,
  AnalyticsEventSchema,
  AnalyticsPeriodQuerySchema,
  API_PREFIX,
  DashboardViewInputSchema,
  DerivedMetricInputSchema,
  ReorderWidgetsSchema,
  UpdateWidgetSchema,
} from "@expresso/contracts";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { z } from "zod";

import { HttpStatusError, requireAuth } from "../../api/plugins/auth-context.js";
import { type IdentityApi } from "../identity/index.js";
import { type AnalyticsApi } from "./index.js";

const IdParams = z.strictObject({ id: z.uuid() });
const DateBody = z.strictObject({ date: z.iso.date() });
const InsightQuery = z.strictObject({ start: z.iso.date(), end: z.iso.date() });
const DerivedQuery = z.strictObject({ date: z.iso.date() }).and(DerivedMetricInputSchema);

export function registerAnalyticsRoutes(app: FastifyInstance, options: {
  service: AnalyticsApi;
  identityService: IdentityApi;
  authenticateRequest: preHandlerHookHandler;
}) {
  app.post(`${API_PREFIX}/analytics/events`, async (request, reply) => {
    const body = AnalyticsEventSchema.safeParse(request.body);
    if (!body.success) throw new HttpStatusError(400, "invalid analytics event");
    const authorization = request.headers.authorization;
    const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : undefined;
    const principal = token ? await options.identityService.verifyAccessToken(token) : null;
    return reply.code(202).send({ data: await options.service.collect(body.data, principal?.user.id) });
  });

  app.post(`${API_PREFIX}/deployments/:id/analytics/aggregate`, { preHandler: options.authenticateRequest }, async (request, reply) => {
    const user = requireAuth(request).user;
    const params = IdParams.safeParse(request.params);
    const body = DateBody.safeParse(request.body);
    if (!params.success || !body.success) throw new HttpStatusError(400, "invalid analytics aggregation request");
    return reply.code(202).send({ data: await options.service.requestAggregation(user.id, params.data.id, body.data.date) });
  });

  app.get(`${API_PREFIX}/deployments/:id/analytics/insight`, { preHandler: options.authenticateRequest }, async (request) => {
    const user = requireAuth(request).user;
    const params = IdParams.safeParse(request.params);
    const query = InsightQuery.safeParse(request.query);
    if (!params.success || !query.success) throw new HttpStatusError(400, "invalid insight request");
    return { data: await options.service.insight(user.id, params.data.id, query.data.start, query.data.end) };
  });

  app.get(`${API_PREFIX}/deployments/:id/analytics/derived`, { preHandler: options.authenticateRequest }, async (request) => {
    const user = requireAuth(request).user;
    const params = IdParams.safeParse(request.params);
    const query = DerivedQuery.safeParse(request.query);
    if (!params.success || !query.success) throw new HttpStatusError(400, "invalid derived metric request");
    return { data: await options.service.calculateDerived(user.id, params.data.id, query.data.date, query.data.numeratorKey, query.data.denominatorKey) };
  });

  /** 07이 여는 순간 읽는 것. 여기서는 아무것도 계산하지 않고 아무것도 쓰지 않는다. */
  app.get(`${API_PREFIX}/portfolios/:id/analytics/dashboard`, { preHandler: options.authenticateRequest }, async (request) => {
    const user = requireAuth(request).user;
    const params = IdParams.safeParse(request.params);
    const query = AnalyticsPeriodQuerySchema.safeParse(request.query ?? {});
    if (!params.success || !query.success) throw new HttpStatusError(400, "invalid dashboard request");
    return { data: await options.service.dashboard(user.id, params.data.id, query.data.period) };
  });

  /** 아직 계산되지 않은 날을 큐에 넣는다. 계산은 워커가 한다. */
  app.post(`${API_PREFIX}/portfolios/:id/analytics/aggregate`, { preHandler: options.authenticateRequest }, async (request, reply) => {
    const user = requireAuth(request).user;
    const params = IdParams.safeParse(request.params);
    const body = AnalyticsPeriodQuerySchema.safeParse(request.body ?? {});
    if (!params.success || !body.success) throw new HttpStatusError(400, "invalid aggregation request");
    return reply.code(202).send({
      data: await options.service.requestPendingAggregation(user.id, params.data.id, body.data.period),
    });
  });

  /** 해설을 쓴다(§8.3). 모델을 부르는 유일한 문이고, 사용자가 누를 때만 열린다. */
  app.post(`${API_PREFIX}/portfolios/:id/analytics/insight`, { preHandler: options.authenticateRequest }, async (request) => {
    const user = requireAuth(request).user;
    const params = IdParams.safeParse(request.params);
    const body = AnalyticsPeriodQuerySchema.safeParse(request.body ?? {});
    if (!params.success || !body.success) throw new HttpStatusError(400, "invalid insight request");
    return { data: await options.service.insightForPortfolio(user.id, params.data.id, body.data.period) };
  });

  /** 07b 지표 라이브러리. 못 쓰는 것도 왜 못 쓰는지와 함께 온다. */
  app.get(`${API_PREFIX}/analytics/metrics`, { preHandler: options.authenticateRequest }, async (request) => {
    return { data: await options.service.catalog(requireAuth(request).user.id) };
  });

  /** "대시보드 편집" — 기본 지면을 내 것으로 굳힌다. 두 번 눌러도 하나다. */
  app.post(`${API_PREFIX}/portfolios/:id/dashboard-layout`, { preHandler: options.authenticateRequest }, async (request) => {
    const user = requireAuth(request).user;
    const params = IdParams.safeParse(request.params);
    const body = AnalyticsPeriodQuerySchema.safeParse(request.body ?? {});
    if (!params.success || !body.success) throw new HttpStatusError(400, "invalid layout request");
    return { data: await options.service.materializeLayout(user.id, params.data.id, body.data.period) };
  });

  /** "레이아웃 초기화" — 굳힌 것을 버리고 기본 지면으로 돌아간다. */
  app.delete(`${API_PREFIX}/portfolios/:id/dashboard-layout`, { preHandler: options.authenticateRequest }, async (request) => {
    const user = requireAuth(request).user;
    const params = IdParams.safeParse(request.params);
    if (!params.success) throw new HttpStatusError(400, "invalid layout request");
    return { data: await options.service.resetLayout(user.id, params.data.id) };
  });

  app.post(`${API_PREFIX}/portfolios/:id/widgets`, { preHandler: options.authenticateRequest }, async (request, reply) => {
    const user = requireAuth(request).user;
    const params = IdParams.safeParse(request.params);
    const body = AddWidgetSchema.and(AnalyticsPeriodQuerySchema).safeParse(request.body);
    if (!params.success || !body.success) throw new HttpStatusError(400, "invalid widget");
    return reply.code(201).send({
      data: await options.service.addWidget(user.id, params.data.id, body.data, body.data.period),
    });
  });

  /** 끌어 놓기. 지면 전체의 차례를 통째로 받는다. */
  app.patch(`${API_PREFIX}/portfolios/:id/widgets/order`, { preHandler: options.authenticateRequest }, async (request) => {
    const user = requireAuth(request).user;
    const params = IdParams.safeParse(request.params);
    const body = ReorderWidgetsSchema.safeParse(request.body);
    if (!params.success || !body.success) throw new HttpStatusError(400, "invalid widget order");
    return { data: await options.service.reorderWidgets(user.id, params.data.id, body.data.widgetIds) };
  });

  app.patch(`${API_PREFIX}/widgets/:id`, { preHandler: options.authenticateRequest }, async (request) => {
    const user = requireAuth(request).user;
    const params = IdParams.safeParse(request.params);
    const body = UpdateWidgetSchema.safeParse(request.body);
    if (!params.success || !body.success) throw new HttpStatusError(400, "invalid widget change");
    return { data: await options.service.updateWidget(user.id, params.data.id, body.data) };
  });

  app.delete(`${API_PREFIX}/widgets/:id`, { preHandler: options.authenticateRequest }, async (request) => {
    const user = requireAuth(request).user;
    const params = IdParams.safeParse(request.params);
    if (!params.success) throw new HttpStatusError(400, "invalid widget");
    return { data: await options.service.deleteWidget(user.id, params.data.id) };
  });

  app.post(`${API_PREFIX}/portfolios/:id/dashboard-views`, { preHandler: options.authenticateRequest }, async (request, reply) => {
    const user = requireAuth(request).user;
    const params = IdParams.safeParse(request.params);
    const body = DashboardViewInputSchema.safeParse(request.body);
    if (!params.success || !body.success) throw new HttpStatusError(400, "invalid dashboard view");
    return reply.code(201).send({ data: await options.service.createDashboardView(user.id, params.data.id, body.data) });
  });
}

