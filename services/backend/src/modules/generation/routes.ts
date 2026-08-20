import { API_PREFIX, IdempotencyKeySchema, SubmitGenerationSchema } from "@expresso/contracts";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { z } from "zod";
import { HttpStatusError, requireAuth } from "../../api/plugins/auth-context.js";
import { writePageStream, type PageStream } from "../page/stream.js";
import type { GenerationService } from "./service.js";

const ParamsSchema = z.strictObject({ id: z.uuid() });
export function registerGenerationRoutes(app: FastifyInstance, options: { generationService: GenerationService; pageStream?: PageStream | null; authenticateRequest: preHandlerHookHandler }) {
  app.post(`${API_PREFIX}/generation-jobs`, { preHandler: options.authenticateRequest }, async (request, reply) => {
    const principal = requireAuth(request);
    const input = SubmitGenerationSchema.safeParse(request.body);
    const key = IdempotencyKeySchema.safeParse(request.headers["idempotency-key"]);
    if (!input.success || !key.success) throw new HttpStatusError(400, "invalid generation request");
    return reply.code(202).send({ data: await options.generationService.submit(principal.user.id, key.data, input.data) });
  });
  app.get(`${API_PREFIX}/generation-jobs/:id`, { preHandler: options.authenticateRequest }, async (request) => {
    const principal = requireAuth(request);
    const params = ParamsSchema.safeParse(request.params);
    if (!params.success) throw new HttpStatusError(400, "invalid generation job ID");
    return { data: await options.generationService.getStatus(principal.user.id, params.data.id) };
  });
  /**
   * 만들어지는 지면을 따라 읽는 자리.
   *
   * **잡으로 연다.** 03 화면이 열릴 때 존재하는 것은 이 잡뿐이다 — 포트폴리오는
   * 워커가 문장과 배치를 다 쓴 뒤(`materializing`)에야 생기고, 그때는 이미
   * 1~2분이 지나 있다. 포트폴리오로 열면 그 사이에 붙을 방법이 없어 첫 지면을
   * 통째로 놓친다.
   *
   * 소유 확인은 `getStatus`가 한다 — 남의 잡이면 거기서 걸린다.
   */
  app.get(`${API_PREFIX}/generation-jobs/:id/page-stream`, { preHandler: options.authenticateRequest }, async (request, reply) => {
    const principal = requireAuth(request);
    const params = ParamsSchema.safeParse(request.params);
    if (!params.success) throw new HttpStatusError(400, "invalid generation job ID");
    if (!options.pageStream) throw new HttpStatusError(503, "지면 스트림이 꺼져 있습니다");
    await options.generationService.getStatus(principal.user.id, params.data.id);
    await writePageStream(request, reply, options.pageStream, params.data.id);
  });
}
