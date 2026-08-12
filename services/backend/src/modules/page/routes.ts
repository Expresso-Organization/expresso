import {
  API_PREFIX,
  PortfolioIdParamsSchema,
  RegeneratePageSchema,
} from "@expresso/contracts";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";

import { HttpStatusError, requireAuth } from "../../api/plugins/auth-context.js";
import { PageGenerationError, type PageGenerator } from "./generator.js";
import { PageServiceError, type PageService } from "./service.js";

export interface RegisterPageRoutesOptions {
  service: PageService;
  generator: PageGenerator;
  authenticateRequest: preHandlerHookHandler;
}

/**
 * 자유 생성 지면.
 *
 * 뽑기 · 꺼내기 · 되짚기 셋뿐이다. **고치는 자리가 없다** — 이 경로에서
 * 마음에 안 드는 지면을 손보는 방법은 지시를 붙여 다시 뽑는 것이고, 그것도
 * 결국 뽑기다.
 */
export function registerPageRoutes(
  app: FastifyInstance,
  options: RegisterPageRoutesOptions,
): void {
  const path = `${API_PREFIX}/portfolios/:id/page`;

  app.post(path, { preHandler: options.authenticateRequest }, async (request, reply) => {
    const principal = requireAuth(request);
    const { id: portfolioId } = PortfolioIdParamsSchema.parse(request.params);
    const { instruction } = RegeneratePageSchema.parse(request.body ?? {});
    const page = await lift(() =>
      options.service.generate(principal.user.id, portfolioId, options.generator, { instruction }));
    return reply.code(201).send({ data: page });
  });

  app.get(path, { preHandler: options.authenticateRequest }, async (request) => {
    const principal = requireAuth(request);
    const { id: portfolioId } = PortfolioIdParamsSchema.parse(request.params);
    const page = await lift(() => options.service.latest(principal.user.id, portfolioId));
    if (!page) throw new HttpStatusError(404, "아직 지면을 만들지 않았습니다");
    return { data: page };
  });

  app.get(`${path}/history`, { preHandler: options.authenticateRequest }, async (request) => {
    const principal = requireAuth(request);
    const { id: portfolioId } = PortfolioIdParamsSchema.parse(request.params);
    return { data: await lift(() => options.service.history(principal.user.id, portfolioId)) };
  });

  /**
   * 완성된 문서 한 장.
   *
   * 배포 미리보기와 내려받기가 이걸 본다. **`text/html`로 나가지만 우리 출처가
   * 아니다** — 소독을 지났어도 남의 지면을 우리 오리진에서 열게 하지 않는다.
   * `Content-Security-Policy: sandbox`가 스크립트와 폼을 다시 한 번 막고,
   * 이 응답이 우리 쿠키에 닿을 길을 없앤다.
   */
  app.get(`${path}/document`, { preHandler: options.authenticateRequest }, async (request, reply) => {
    const principal = requireAuth(request);
    const { id: portfolioId } = PortfolioIdParamsSchema.parse(request.params);
    const document = await lift(() => options.service.document(principal.user.id, portfolioId));
    if (!document) throw new HttpStatusError(404, "아직 지면을 만들지 않았습니다");
    return reply
      .header("content-type", "text/html; charset=utf-8")
      .header("content-security-policy", "sandbox allow-popups; script-src 'none'; form-action 'none'")
      .header("x-content-type-options", "nosniff")
      .send(document);
  });
}

async function lift<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof PageServiceError) throw new HttpStatusError(error.statusCode, error.message);
    // 두 번 다 거절당한 것은 모델의 실패지 사용자의 실패가 아니다. 502가 맞다.
    if (error instanceof PageGenerationError) throw new HttpStatusError(502, error.message);
    throw error;
  }
}
