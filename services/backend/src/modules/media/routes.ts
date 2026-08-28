import {
  API_PREFIX,
  CreateMediaBlockSchema,
  MEDIA_MAX_BYTES,
  MEDIA_MIME_TYPES,
  MediaAssetParamsSchema,
  MediaBlockParamsSchema,
  MediaWidthQuerySchema,
} from "@expresso/contracts";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";

import { HttpStatusError, requireAuth } from "../../api/plugins/auth-context.js";
import { MediaError, type MediaApi } from "./index.js";

export interface RegisterMediaRoutesOptions {
  service: MediaApi;
  authenticateRequest: preHandlerHookHandler;
}

/**
 * 그림 올리기 · 내려받기 · 지면에 놓기.
 *
 * **본문을 그대로 받는다.** multipart 대신 원시 바이트다 — 우리가 받는 것은
 * 파일 하나뿐이고, 브라우저는 `fetch(url, { body: file })` 한 줄로 보낼 수 있다.
 * multipart는 경계 파서와 임시 파일과 의존성을 하나 더 끌고 오는데, 그걸로
 * 얻는 것이 이 경로에는 없다.
 */
export function registerMediaRoutes(
  app: FastifyInstance,
  options: RegisterMediaRoutesOptions,
): void {
  // 이미지 본문은 파싱하지 않고 Buffer로 받는다. 형식 판정은 서비스가 바이트로 한다.
  for (const mimeType of MEDIA_MIME_TYPES) {
    app.addContentTypeParser(
      mimeType,
      { parseAs: "buffer", bodyLimit: MEDIA_MAX_BYTES },
      (_request, body, done) => { done(null, body); },
    );
  }

  app.post(`${API_PREFIX}/media`, { preHandler: options.authenticateRequest }, async (request, reply) => {
    const principal = requireAuth(request);
    const body = request.body;
    if (!Buffer.isBuffer(body)) {
      throw new HttpStatusError(415, `이미지 본문을 그대로 보내 주세요 (${MEDIA_MIME_TYPES.join(" · ")})`);
    }
    const asset = await lift(() => options.service.upload(principal.user.id, body));
    return reply.code(201).send({ data: asset });
  });

  app.get(`${API_PREFIX}/media`, { preHandler: options.authenticateRequest }, async (request) => {
    const principal = requireAuth(request);
    return { data: await lift(() => options.service.list(principal.user.id)) };
  });

  /**
   * 방문자가 그림을 받는 자리. **인증이 없다** — 공개 지면에 실릴 그림이고,
   * 링크를 받은 사람이 그림만 못 보는 일이 있어서는 안 된다(`media.ts`).
   */
  app.get(`${API_PREFIX}/media/:id`, async (request, reply) => {
    const params = MediaAssetParamsSchema.safeParse(request.params);
    if (!params.success) throw new HttpStatusError(400, "invalid asset id");
    // `?w=`는 브라우저가 `srcset`에서 고른 폭이다. 없으면 원본을 준다.
    const width = MediaWidthQuerySchema.safeParse(request.query);
    const asset = await lift(() => options.service.read(params.data.id, width.data?.w));
    return reply
      .header("content-type", asset.mimeType)
      .header("content-length", String(asset.bytes.length))
      // 내용이 바뀌면 식별자가 바뀐다. 같은 주소는 늘 같은 바이트다.
      .header("cache-control", "public, max-age=31536000, immutable")
      // 이미지라고 적혀 있어도 브라우저가 다른 것으로 읽지 않게 못박는다.
      .header("x-content-type-options", "nosniff")
      .send(asset.bytes);
  });

  app.post(
    `${API_PREFIX}/portfolios/:id/sections/:sectionId/media-blocks`,
    { preHandler: options.authenticateRequest },
    async (request, reply) => {
      const principal = requireAuth(request);
      const params = MediaBlockParamsSchema.safeParse(request.params);
      const body = CreateMediaBlockSchema.safeParse(request.body);
      if (!params.success) throw new HttpStatusError(400, "invalid route parameters");
      if (!body.success) throw new HttpStatusError(400, "invalid media block");
      const created = await lift(() =>
        options.service.addBlock(principal.user.id, params.data.id, params.data.sectionId, body.data));
      return reply.code(201).send({ data: created });
    },
  );
}

async function lift<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof MediaError) throw new HttpStatusError(error.statusCode, error.message);
    throw error;
  }
}
