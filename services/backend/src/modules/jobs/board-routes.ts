import {
  API_PREFIX,
  JobPostingDetailResponseSchema,
  JobPostingIdParamsSchema,
  ListJobPostingsQuerySchema,
} from "@expresso/contracts";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { z } from "zod";

import { HttpStatusError, requireAuth } from "../../api/plugins/auth-context.js";
import type { JobBoardService } from "./board-service.js";

const RecentSearchQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(20).default(10),
});

const CompanyIdParamsSchema = z.strictObject({ id: z.uuid() });

export interface RegisterJobBoardRoutesOptions {
  service: JobBoardService;
  authenticateRequest: preHandlerHookHandler;
}

export function registerJobBoardRoutes(
  app: FastifyInstance,
  options: RegisterJobBoardRoutesOptions,
): void {
  const preHandler = options.authenticateRequest;

  app.get(`${API_PREFIX}/jobs/postings`, { preHandler }, async (request) => {
    const principal = requireAuth(request);
    const query = ListJobPostingsQuerySchema.safeParse(request.query);
    if (!query.success) throw new HttpStatusError(400, "invalid query parameters");
    return options.service.list(principal.user.id, query.data);
  });

  app.get(`${API_PREFIX}/jobs/recent-searches`, { preHandler }, async (request) => {
    const principal = requireAuth(request);
    const query = RecentSearchQuerySchema.safeParse(request.query);
    if (!query.success) throw new HttpStatusError(400, "invalid query parameters");
    return options.service.recentSearches(principal.user.id, query.data.limit);
  });

  /**
   * 회사 마크. **인증이 없다** — `<img>`가 부르는 자리라 쿠키가 붙지 않고,
   * 담긴 것은 회사가 자기 사이트에 공개해 둔 아이콘이다.
   *
   * 주소에 그림의 지문(`?v=`)이 들어 있어 내용이 바뀌면 주소가 바뀐다.
   * 그래서 영원히 캐시해도 된다고 말할 수 있다.
   */
  app.get(`${API_PREFIX}/companies/:id/logo`, async (request, reply) => {
    const params = CompanyIdParamsSchema.safeParse(request.params);
    if (!params.success) throw new HttpStatusError(400, "invalid company id");
    const logo = await options.service.logo(params.data.id);
    if (!logo) throw new HttpStatusError(404, "no logo for this company");
    return reply
      .header("content-type", logo.mediaType)
      .header("content-length", String(logo.bytes.length))
      .header("cache-control", "public, max-age=31536000, immutable")
      // 이미지라고 적혀 있어도 브라우저가 다른 것으로 읽지 않게 못박는다.
      .header("x-content-type-options", "nosniff")
      // 남의 사이트에서 받아 온 바이트다. 문서로 열리는 길을 아예 닫는다.
      .header("content-security-policy", "default-src 'none'; sandbox")
      .send(logo.bytes);
  });

  app.get(`${API_PREFIX}/jobs/postings/:id`, { preHandler }, async (request) => {
    const principal = requireAuth(request);
    const params = JobPostingIdParamsSchema.safeParse(request.params);
    if (!params.success) throw new HttpStatusError(400, "invalid route parameters");
    return JobPostingDetailResponseSchema.parse({
      data: await options.service.get(principal.user.id, params.data.id),
    });
  });
}
