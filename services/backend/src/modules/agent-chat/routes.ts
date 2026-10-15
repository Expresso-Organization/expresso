import { setTimeout as delay } from "node:timers/promises";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { API_PREFIX, UuidSchema, CreateAgentConversationSchema, SendAgentMessageSchema, AddAgentContextSchema, AgentApprovalSchema, SaveAgentApiKeySchema, SetAgentContextsSchema } from "@expresso/contracts";
import { requireAuth } from "../../api/plugins/auth-context.js";
import type { AgentChatService } from "./service.js";

export function registerAgentChatRoutes(app: FastifyInstance, service: AgentChatService, authenticate: preHandlerHookHandler, developerUserIds: readonly string[] = []) {
  const base = `${API_PREFIX}/agent/conversations`;
  const options = { preHandler: authenticate };
  const id = (params: unknown) => UuidSchema.parse((params as { id: string }).id);
  const developer = (userId: string) => developerUserIds.includes(userId);
  app.get(`${API_PREFIX}/agent/access`, options, async req => ({ data: { enabled: service.enabled, serverCredentialAllowed: developer(requireAuth(req).user.id), consentRequired: await service.consentRequired(requireAuth(req).user.id), apiKeyConfigured: await service.credentials.configured(requireAuth(req).user.id), model: "sonnet" } }));
  app.put(`${API_PREFIX}/agent/credential`, options, async req => { await service.credentials.save(requireAuth(req).user.id, SaveAgentApiKeySchema.parse(req.body).apiKey); return { data: { configured: true } }; });
  app.delete(`${API_PREFIX}/agent/credential`, options, async req => { await service.credentials.remove(requireAuth(req).user.id); return { data: { configured: false } }; });
  app.get(base, options, async req => ({ data: await service.list(requireAuth(req).user.id) }));
  app.post(base, options, async (req, reply) => { const input = CreateAgentConversationSchema.parse(req.body); return reply.code(201).send({ data: await service.create(requireAuth(req).user.id, input.contexts) }); });
  app.get(`${base}/:id`, options, async req => ({ data: await service.get(requireAuth(req).user.id, id(req.params)) }));
  app.post(`${base}/:id/messages`, options, async (req, reply) => { const principal = requireAuth(req); const input = SendAgentMessageSchema.parse(req.body); const apiKey = developer(principal.user.id) ? undefined : await service.credentials.read(principal.user.id); if (!developer(principal.user.id) && !apiKey) return reply.code(403).send({ error: { message: "Anthropic API 키를 입력해 주세요." } }); return reply.code(202).send({ data: await service.send(principal.user.id, id(req.params), input, apiKey) }); });
  app.post(`${base}/:id/contexts`, options, async req => ({ data: await service.attach(requireAuth(req).user.id, id(req.params), AddAgentContextSchema.parse(req.body).context) }));
  app.post(`${base}/:id/context-selection`, options, async req => { const input = SetAgentContextsSchema.parse(req.body); return { data: await service.setContexts(requireAuth(req).user.id, id(req.params), input.contexts, input.expectedVersion) }; });
  app.post(`${base}/:id/cancel`, options, async req => ({ data: await service.cancel(requireAuth(req).user.id, id(req.params)) }));
  app.post(`${base}/:id/approval`, options, async req => ({ data: await service.approve(requireAuth(req).user.id, id(req.params), AgentApprovalSchema.parse(req.body)) }));
  app.get(`${base}/:id/events`, options, async (req, reply) => {
    const userId = requireAuth(req).user.id; const conversationId = id(req.params);
    let snapshot = await service.get(userId, conversationId);
    const abort = new AbortController(); reply.raw.on("close", () => abort.abort());
    reply.hijack(); reply.raw.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", "x-accel-buffering": "no" });
    let version = -1;
    try {
      // 재연결은 저장된 전체 상태에서 시작하므로 델타를 중복 적용하지 않습니다.
      while (!abort.signal.aborted) {
        if (snapshot.version !== version) {
          if (!reply.raw.write(`id: ${snapshot.version}\nevent: snapshot\ndata: ${JSON.stringify({ data: snapshot })}\n\n`)) break;
          version = snapshot.version;
        }
        if (snapshot.run?.status !== "running") break;
        await delay(500, undefined, { signal: abort.signal });
        snapshot = await service.get(userId, conversationId);
      }
    } catch { /* 접속 종료 후에도 모델 실행은 서버에서 계속됩니다. */ }
    finally { reply.raw.end(); }
  });
  app.addHook("onClose", async () => service.close());
}
