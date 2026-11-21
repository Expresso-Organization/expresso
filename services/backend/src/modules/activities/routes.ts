import { API_PREFIX, ListActivitiesQuerySchema } from "@expresso/contracts";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { z } from "zod";

import { HttpStatusError } from "../../api/plugins/auth-context.js";
import type { ActivityApi } from "./index.js";

const PosterParamsSchema = z.strictObject({ id: z.string().min(1).max(120) });

export function registerActivityRoutes(app: FastifyInstance, options: { service: Pick<ActivityApi, "page" | "poster">; authenticateRequest: preHandlerHookHandler }) {
  /**
   * 활동 포스터. 회사 로고(`/companies/:id/logo`)처럼 인증 없이 내보낸다 — 목록이 주는 주소에 체크섬(`v`)이 있어
   * 1년 동안 캐시해도 그림이 바뀌면 주소가 바뀐다.
   */
  app.get(`${API_PREFIX}/activities/:id/poster`, async (request, reply) => {
    const params = PosterParamsSchema.safeParse(request.params);
    if (!params.success) throw new HttpStatusError(400, "invalid activity id");
    const poster = await options.service.poster(params.data.id);
    if (!poster) throw new HttpStatusError(404, "no poster for this activity");
    return reply
      .header("content-type", poster.mediaType)
      .header("content-length", String(poster.bytes.length))
      .header("cache-control", "public, max-age=31536000, immutable")
      // 이미지라고 적혀 있어도 브라우저가 다른 것으로 읽지 않게 못박는다.
      .header("x-content-type-options", "nosniff")
      // 남의 사이트에서 받아 온 그림을 줄인 것이다. 문서로 열리는 길을 아예 닫는다.
      .header("content-security-policy", "default-src 'none'; sandbox")
      .send(poster.bytes);
  });

  app.get(`${API_PREFIX}/activities`, { preHandler: options.authenticateRequest }, async (request) => {
    const query = ListActivitiesQuerySchema.safeParse(request.query);
    if (!query.success) throw new HttpStatusError(400, "invalid activity query");
    const { data, total } = await options.service.page(query.data);
    return { data, summary: { total } };
  });
}
