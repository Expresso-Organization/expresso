import {
  API_PREFIX,
  IdempotencyKeySchema,
  InterpretJobSearchSchema,
  InterpretedJobSearchSchema,
  SaveJobSearchSchema,
  SubmitJobPostingSchema,
  UpsertJobInterestSchema,
  CreateJobSourceSchema,
  ImportJobPostingSchema,
} from "@expresso/contracts";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { z } from "zod";

import { HttpStatusError, requireAuth } from "../../api/plugins/auth-context.js";
import type { JobMarketService } from "./service.js";
import type { JobIngestService } from "./ingest/service.js";
import type { JobUrlImporter } from "./ingest/url-import.js";

const IdParamsSchema = z.strictObject({ id: z.uuid() });
const DemandSummaryRequestSchema = z.strictObject({
  jobPostingIds: z.array(z.uuid()).max(200),
});

export interface RegisterJobMarketRoutesOptions {
  jobMarketService: JobMarketService;
  /** 수집은 워커가 한다. API에는 목록과 수동 실행만 있으면 된다. */
  jobIngestService?: JobIngestService | undefined;
  jobUrlImporter?: JobUrlImporter | undefined;
  authenticateRequest: preHandlerHookHandler;
}

function parse<T>(
  schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } },
  value: unknown,
): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new HttpStatusError(400, "invalid job market request");
  return parsed.data;
}

export function registerJobMarketRoutes(
  app: FastifyInstance,
  options: RegisterJobMarketRoutesOptions,
): void {
  const preHandler = options.authenticateRequest;

  app.post(`${API_PREFIX}/jobs/submissions`, { preHandler }, async (request, reply) => {
    const principal = requireAuth(request);
    const idempotencyKey = parse(
      IdempotencyKeySchema,
      request.headers["idempotency-key"],
    );
    const input = parse(SubmitJobPostingSchema, request.body);
    const submitted = await options.jobMarketService.submitPosting(
      principal.user.id,
      idempotencyKey,
      input,
    );
    return reply.code(202).send({ data: submitted });
  });

  app.post(`${API_PREFIX}/jobs/search/interpret`, { preHandler }, async (request) => {
    const principal = requireAuth(request);
    const input = parse(InterpretJobSearchSchema, request.body);
    return InterpretedJobSearchSchema.parse(
      await options.jobMarketService.interpretSearch(
        principal.user.id,
        input.query,
        input.resultCount,
      ),
    );
  });

  app.delete(`${API_PREFIX}/jobs/recent-searches/:id`, { preHandler }, async (request, reply) => {
    const principal = requireAuth(request);
    const { id } = parse(IdParamsSchema, request.params);
    await options.jobMarketService.deleteRecentSearch(principal.user.id, id);
    return reply.code(204).send();
  });

  app.post(`${API_PREFIX}/jobs/saved-searches`, { preHandler }, async (request, reply) => {
    const principal = requireAuth(request);
    const input = parse(SaveJobSearchSchema, request.body);
    return reply.code(201).send({
      data: await options.jobMarketService.saveSearch(principal.user.id, input),
    });
  });

  app.get(`${API_PREFIX}/jobs/saved-searches`, { preHandler }, async (request) => {
    const principal = requireAuth(request);
    return {
      data: await options.jobMarketService.listSavedSearches(principal.user.id),
    };
  });

  app.put(`${API_PREFIX}/jobs/postings/:id/interest`, { preHandler }, async (request) => {
    const principal = requireAuth(request);
    const { id } = parse(IdParamsSchema, request.params);
    const input = parse(UpsertJobInterestSchema, request.body);
    return {
      data: await options.jobMarketService.upsertInterest(principal.user.id, id, input),
    };
  });

  /** 모아 둔 공고를 내 분석으로 가져온다. 제작은 분석 위에서만 시작한다. */
  app.post(`${API_PREFIX}/jobs/postings/:id/analyses`, { preHandler }, async (request, reply) => {
    const principal = requireAuth(request);
    const { id } = parse(IdParamsSchema, request.params);
    const analyzed = await options.jobMarketService.analyzePosting(principal.user.id, id);
    // 이미 있던 분석이면 만들지 않았다. 201은 만들었다는 뜻이다.
    return reply.code(analyzed.reused ? 200 : 201).send({ data: analyzed });
  });

  app.post(`${API_PREFIX}/jobs/postings/:id/match`, { preHandler }, async (request) => {
    const principal = requireAuth(request);
    const { id } = parse(IdParamsSchema, request.params);
    return {
      data: await options.jobMarketService.computeMatch(principal.user.id, id),
    };
  });

  /**
   * 주소 한 건으로 공고를 읽어 온다. **저장하지 않는다** — 읽은 것을 돌려주고,
   * 사용자가 보고 고친 뒤 `/jobs/submissions`로 제출한다. 원문은 한 번 저장하면
   * 고칠 수 없으므로(0002) 확인 없이 넣으면 되돌릴 방법이 없다.
   */
  if (options.jobUrlImporter) {
    const importer = options.jobUrlImporter;
    app.post(`${API_PREFIX}/jobs/url-imports`, { preHandler }, async (request) => {
      requireAuth(request);
      const input = parse(ImportJobPostingSchema, request.body);
      return { data: await importer.read(input.url) };
    });
  }

  if (options.jobIngestService) {
    const ingest = options.jobIngestService;

    /** 06 헤더가 "어디서 몇 건" 말하려면 출처를 알아야 한다. */
    app.get(`${API_PREFIX}/job-sources`, { preHandler }, async (request) => {
      requireAuth(request);
      return { data: await ingest.listSources() };
    });

    app.post(`${API_PREFIX}/job-sources`, { preHandler }, async (request, reply) => {
      requireAuth(request);
      const input = parse(CreateJobSourceSchema, request.body);
      return reply.code(201).send({ data: await ingest.addSource(input) });
    });

    /** 매일 아침을 기다리지 않고 지금 모은다. */
    app.post(`${API_PREFIX}/job-sources/runs`, { preHandler }, async (request, reply) => {
      requireAuth(request);
      return reply.code(202).send({ data: await ingest.run() });
    });

    /** 한 곳만 다시. 어젯밤 그 출처만 실패했을 때 전체를 다시 돌릴 이유가 없다. */
    app.post(`${API_PREFIX}/job-sources/:id/runs`, { preHandler }, async (request, reply) => {
      requireAuth(request);
      const { id } = parse(IdParamsSchema, request.params);
      return reply.code(202).send({ data: await ingest.run(new Date(), [id]) });
    });
  }

  app.post(`${API_PREFIX}/jobs/demand-summary`, { preHandler }, async (request) => {
    requireAuth(request);
    const input = parse(DemandSummaryRequestSchema, request.body);
    return {
      data: await options.jobMarketService.summarizeDemand(input.jobPostingIds),
    };
  });
}
