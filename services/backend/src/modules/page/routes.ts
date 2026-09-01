import {
  API_PREFIX,
  PortfolioIdParamsSchema,
  RegeneratePageSchema,
} from "@expresso/contracts";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";

import { HttpStatusError, requireAuth } from "../../api/plugins/auth-context.js";
import { PageGenerationError, type PageGenerator } from "./generator.js";
import { PageServiceError, type PageApi } from "./index.js";
import { writeDraftStream } from "../../platform/draft-stream.js";
import type { PageStream } from "./stream.js";

export interface RegisterPageRoutesOptions {
  service: PageApi;
  generator: PageGenerator;
  /** 없으면 흘려보내는 자리를 열지 않는다. */
  stream?: PageStream | null;
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
      options.service.generate(principal.user.id, portfolioId, options.generator, instruction === undefined ? {} : { instruction }));
    return reply.code(201).send({ data: page });
  });

  app.get(path, { preHandler: options.authenticateRequest }, async (request) => {
    const principal = requireAuth(request);
    const { id: portfolioId } = PortfolioIdParamsSchema.parse(request.params);
    const page = await lift(() => options.service.latest(principal.user.id, portfolioId));
    if (!page) throw new HttpStatusError(404, "아직 지면을 만들지 않았습니다");
    return { data: page };
  });

  /**
   * 만들어지는 동안.
   *
   * **완성된 지면이 아니라 조각이 흐른다.** 받는 쪽은 이어 붙여 `partialFields`로
   * 읽는다(계약 쪽에 있다 — 흘리는 쪽과 그리는 쪽이 같은 코드를 본다).
   *
   * 조각을 못 내는 프로바이더에서도 이 자리는 값이 있다. `done`과 `failed`는
   * 프로바이더와 무관하게 나가므로, **끝났을 때 화면이 스스로 넘어간다.**
   * 지금까지는 사람이 새로고침을 눌러야만 알 수 있었다.
   *
   * 브라우저는 `Authorization`을 못 붙인다(EventSource). 그래서 이 자리는
   * 웹 서버가 세션으로 대신 붙어 흘려 준다 — 토큰이 주소에 실리지 않는다.
   */
  /**
   * 만들어지는 동안 — 포트폴리오로 여는 자리.
   *
   * 04b에서 지시를 붙여 다시 뽑을 때 쓴다. 그때는 포트폴리오가 이미 있다.
   * 처음 뽑는 03은 아직 포트폴리오가 없어서 **잡으로 연다**
   * (`/generation-jobs/:id/page-stream`).
   */
  app.get(`${path}/stream`, { preHandler: options.authenticateRequest }, async (request, reply) => {
    const principal = requireAuth(request);
    const { id: portfolioId } = PortfolioIdParamsSchema.parse(request.params);
    const stream = options.stream;
    if (!stream) throw new HttpStatusError(503, "지면 스트림이 꺼져 있습니다");
    if (!await options.service.owns(principal.user.id, portfolioId)) {
      throw new HttpStatusError(404, "portfolio not found");
    }
    await writeDraftStream(request, reply, stream, portfolioId);
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
