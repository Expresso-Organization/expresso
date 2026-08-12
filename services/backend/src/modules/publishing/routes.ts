import {
  API_PREFIX,
  IdempotencyKeySchema,
  PublishPortfolioSchema,
  ReplaceResumeSchema,
  SlugSchema,
  SubmitExportSchema,
} from "@expresso/contracts";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { z } from "zod";

import { HttpStatusError, requireAuth } from "../../api/plugins/auth-context.js";
import type { PublishingService } from "./service.js";

const PortfolioParams = z.strictObject({ id: z.uuid() });
const DeploymentParams = z.strictObject({ id: z.uuid(), deploymentId: z.uuid() });
const JobParams = z.strictObject({ id: z.uuid() });
const SlugParams = z.strictObject({ slug: SlugSchema });
const SignBody = z.strictObject({ ttlSeconds: z.number().int().min(1).max(86_400).default(300) });
const AssetQuery = z.strictObject({
  version: z.coerce.number().int().positive(),
  expires: z.coerce.number().int().positive(),
  signature: z.string().regex(/^[a-f0-9]{64}$/),
});

export function registerPublishingRoutes(app: FastifyInstance, options: {
  service: PublishingService;
  authenticateRequest: preHandlerHookHandler;
}) {
  app.get(`${API_PREFIX}/public/portfolios/:slug`, async (request) => {
    const params = SlugParams.safeParse(request.params);
    if (!params.success) throw new HttpStatusError(400, "invalid public slug");
    return { data: await options.service.getPublic(params.data.slug) };
  });

  app.get(`${API_PREFIX}/public/assets/:id`, async (request) => {
    const params = JobParams.safeParse(request.params);
    const query = AssetQuery.safeParse(request.query);
    if (!params.success || !query.success) throw new HttpStatusError(400, "invalid signed asset request");
    return { data: await options.service.resolveAsset(params.data.id, query.data.version, query.data.expires, query.data.signature) };
  });

  /** 08b 버전 목록. 되돌릴 대상을 여기서 고른다. */
  app.get(`${API_PREFIX}/portfolios/:id/deployments`, { preHandler: options.authenticateRequest }, async (request) => {
    const user = requireAuth(request).user;
    const params = PortfolioParams.safeParse(request.params);
    if (!params.success) throw new HttpStatusError(400, "invalid portfolio ID");
    return { data: await options.service.listDeployments(user.id, params.data.id) };
  });

  app.post(`${API_PREFIX}/portfolios/:id/deployments`, { preHandler: options.authenticateRequest }, async (request, reply) => {
    const user = requireAuth(request).user;
    const params = PortfolioParams.safeParse(request.params);
    const body = PublishPortfolioSchema.safeParse(request.body);
    if (!params.success || !body.success) throw new HttpStatusError(400, "invalid publication request");
    return reply.code(201).send({ data: await options.service.publish(user.id, params.data.id, body.data) });
  });

  app.post(`${API_PREFIX}/portfolios/:id/deployments/:deploymentId/rollback`, { preHandler: options.authenticateRequest }, async (request) => {
    const user = requireAuth(request).user;
    const params = DeploymentParams.safeParse(request.params);
    if (!params.success) throw new HttpStatusError(400, "invalid deployment rollback");
    return { data: await options.service.rollback(user.id, params.data.id, params.data.deploymentId) };
  });

  app.delete(`${API_PREFIX}/portfolios/:id/publication`, { preHandler: options.authenticateRequest }, async (request) => {
    const user = requireAuth(request).user;
    const params = PortfolioParams.safeParse(request.params);
    if (!params.success) throw new HttpStatusError(400, "invalid portfolio ID");
    return { data: await options.service.unpublish(user.id, params.data.id) };
  });

  app.post(`${API_PREFIX}/portfolios/:id/exports`, { preHandler: options.authenticateRequest }, async (request, reply) => {
    const user = requireAuth(request).user;
    const params = PortfolioParams.safeParse(request.params);
    const body = SubmitExportSchema.safeParse(request.body);
    const key = IdempotencyKeySchema.safeParse(request.headers["idempotency-key"]);
    if (!params.success || !body.success || !key.success) throw new HttpStatusError(400, "invalid export request");
    return reply.code(202).send({ data: await options.service.submitExport(user.id, params.data.id, key.data, body.data) });
  });

  app.get(`${API_PREFIX}/export-jobs/:id`, { preHandler: options.authenticateRequest }, async (request) => {
    const user = requireAuth(request).user;
    const params = JobParams.safeParse(request.params);
    if (!params.success) throw new HttpStatusError(400, "invalid export job ID");
    return { data: await options.service.getExport(user.id, params.data.id) };
  });

  app.post(`${API_PREFIX}/portfolios/:id/resume-assets`, { preHandler: options.authenticateRequest }, async (request, reply) => {
    const user = requireAuth(request).user;
    const params = PortfolioParams.safeParse(request.params);
    const body = ReplaceResumeSchema.safeParse(request.body);
    if (!params.success || !body.success) throw new HttpStatusError(400, "invalid resume asset");
    return reply.code(201).send({ data: await options.service.replaceResume(user.id, params.data.id, body.data.fileUrl) });
  });

  app.post(`${API_PREFIX}/assets/:id/signed-url`, { preHandler: options.authenticateRequest }, async (request) => {
    const user = requireAuth(request).user;
    const params = JobParams.safeParse(request.params);
    const body = SignBody.safeParse(request.body ?? {});
    if (!params.success || !body.success) throw new HttpStatusError(400, "invalid asset signing request");
    return { data: await options.service.signAsset(user.id, params.data.id, body.data.ttlSeconds) };
  });
}

