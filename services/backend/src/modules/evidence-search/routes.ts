import { SearchMaintenanceRequestSchema, SearchMaintenanceResponseSchema, SearchIndexHealthResponseSchema, API_PREFIX, EvidenceSearchInputSchema, EvidenceSearchResponseSchema, SemanticJobInputSchema, SemanticJobResponseSchema, SearchSyncResponseSchema } from "@expresso/contracts";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { HttpStatusError, requireAuth } from "../../api/plugins/auth-context.js";
import type { EvidenceSearchService } from "./service.js";
export function registerEvidenceSearchRoutes(app: FastifyInstance, service: EvidenceSearchService, authenticateRequest: preHandlerHookHandler) {
  const config = { preHandler: authenticateRequest, bodyLimit: 16 * 1024 };
  app.get(`${API_PREFIX}/career/evidence-search/health`, config, async request =>
    SearchIndexHealthResponseSchema.parse({ data: await service.health(requireAuth(request).user.id) }));
  app.post(`${API_PREFIX}/career/evidence-search/reindex`, config, async (request, reply) => {
    const input = SearchMaintenanceRequestSchema.safeParse(request.body);
    if (!input.success) throw new HttpStatusError(400, "재색인 요청 식별자를 확인하세요.");
    return reply.code(202).send(SearchMaintenanceResponseSchema.parse({ data: await service.requestSync(requireAuth(request).user.id, input.data.requestId) }));
  });
  app.post(`${API_PREFIX}/career/evidence-search`, config, async request => {
    const parsed = EvidenceSearchInputSchema.safeParse(request.body);
    if (!parsed.success) throw new HttpStatusError(400, "경력 검색 입력을 확인하세요.");
    return EvidenceSearchResponseSchema.parse({ data: await service.search(requireAuth(request).user.id, parsed.data) });
  });
  app.post(`${API_PREFIX}/career/evidence-search/sync`, config, async request => SearchSyncResponseSchema.parse({ data: await service.sync(requireAuth(request).user.id) }));
  app.post(`${API_PREFIX}/jobs/semantic-search`, config, async request => {
    const parsed = SemanticJobInputSchema.safeParse(request.body);
    if (!parsed.success) throw new HttpStatusError(400, "공고 검색 입력을 확인하세요.");
    return SemanticJobResponseSchema.parse({ data: await service.searchJobs(requireAuth(request).user.id, parsed.data) });
  });
}
