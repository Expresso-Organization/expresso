import { API_PREFIX, EvidenceSearchInputSchema, EvidenceSearchResponseSchema, SemanticJobInputSchema, SemanticJobResponseSchema, SearchSyncResponseSchema } from "@expresso/contracts";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { HttpStatusError, requireAuth } from "../../api/plugins/auth-context.js";
import type { EvidenceSearchService } from "./service.js";
export function registerEvidenceSearchRoutes(app: FastifyInstance, service: EvidenceSearchService, authenticateRequest: preHandlerHookHandler) {
  const config = { preHandler: authenticateRequest, bodyLimit: 16 * 1024 };
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
