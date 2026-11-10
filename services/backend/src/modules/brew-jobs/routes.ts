import { API_PREFIX, BrewJobResponseSchema, type BrewJobStatus } from "@expresso/contracts";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { z } from "zod";

import { HttpStatusError, requireAuth } from "../../api/plugins/auth-context.js";
import { BrewJobError, type BrewJobApi } from "./index.js";

const ParamsSchema = z.strictObject({ id: z.uuid() });

/** 01b · 02b가 진행 상태를 읽는 자리. */
export function registerBrewJobRoutes(
  app: FastifyInstance,
  options: { service: BrewJobApi; authenticateRequest: preHandlerHookHandler },
): void {
  app.get(`${API_PREFIX}/brew-jobs/:id`, { preHandler: options.authenticateRequest },
    async (request) => {
      const principal = requireAuth(request);
      const params = ParamsSchema.safeParse(request.params);
      if (!params.success) throw new HttpStatusError(400, "invalid brew job ID");
      try {
        return BrewJobResponseSchema.parse({
          data: await options.service.getStatus(principal.user.id, params.data.id),
        });
      } catch (error) {
        if (error instanceof BrewJobError) throw new HttpStatusError(error.statusCode, error.message);
        throw error;
      }
    });

  /**
   * 잡 상태가 바뀌는 순간을 SSE로 보낸다. 화면은 1.5초마다 다시 읽는 대신 이것을 듣고 끝난 순간 다시 그린다.
   *
   * 지금 상태를 한 번 보내고 바뀔 때마다 하나씩 보낸다. `succeeded` · `failed`에서 끝낸다. 남의 잡 · 없는
   * 잡은 흐름을 열기 전에 404로 답한다 — 첫 상태를 hijack 전에 받는다. 앞단의 유휴 시간 초과로 끊기면
   * 화면이 폴링으로 돌아가므로 하트비트를 두지 않는다.
   */
  app.get(`${API_PREFIX}/brew-jobs/:id/events`, { preHandler: options.authenticateRequest },
    async (request, reply) => {
      const principal = requireAuth(request);
      const params = ParamsSchema.safeParse(request.params);
      if (!params.success) throw new HttpStatusError(400, "invalid brew job ID");
      const abort = new AbortController();
      request.raw.on("close", () => abort.abort());
      const statuses = options.service.follow(principal.user.id, params.data.id, abort.signal);
      let first: IteratorResult<BrewJobStatus>;
      try {
        first = await statuses.next();
      } catch (error) {
        if (error instanceof BrewJobError) throw new HttpStatusError(error.statusCode, error.message);
        throw error;
      }

      reply.hijack();
      const raw = reply.raw;
      raw.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "x-accel-buffering": "no",
      });
      // 첫 write 전에는 헤더가 나가지 않는다(`writePageStream`과 같은 사정).
      raw.flushHeaders();
      const send = (status: BrewJobStatus) => raw.write(`event: status\ndata: ${JSON.stringify({ data: status })}\n\n`);
      try {
        if (!first.done) send(first.value);
        for await (const status of statuses) send(status);
      } catch {
        // 접속이 끊기거나 흐름이 끊겼다. 화면은 폴링으로 돌아간다.
      } finally {
        await statuses.return(undefined).catch(() => undefined);
        raw.end();
      }
    });
}
