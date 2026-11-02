import {
  API_PREFIX, CareerWriteOperationResponseSchema, CareerPropertyMutationStatusResponseSchema,CareerResumePropertyMutationSchema,
  CareerRegisterPropertyOptionSchema, CareerPropertyOptionResponseSchema,
  CareerCategoriesResponseSchema,
  CareerCategoryIdParamsSchema,
  CareerRecordIdParamsSchema,
  CareerProfileResponseSchema,
  CareerSkillEvidenceResponseSchema,
  OptionalCareerProfileResponseSchema,
  SaveCareerProfileSchema,
  CareerSkillIdParamsSchema,
  CareerRecordResponseSchema,
  CareerRecordSchema,
  CareerViewConfigurationSchema,
  CreateCareerCategorySchema,
  CreateCareerRecordLinkSchema,
  CreateCareerRecordSchema,
  IdempotencyKeySchema,
  ListCareerRecordsQuerySchema,
  RecomputeCareerSkillSchema,
  UpdateCareerRecordSchema,
  CareerPropertySchemaChangeSchema,
  ApplyCareerPropertyChangeSchema,
  CareerPropertyChangePreviewSchema,
  CareerCategoryMoveCommitSchema,
  CommitCareerCategoryMoveRequestSchema,
  CareerCategoryMovePreviewSchema,
  ListCareerRelationTargetsQuerySchema,
  PreviewCareerCategoryMoveSchema,
  ReplaceCareerRelationTargetsSchema,
  PreviewCareerFormulaSchema,
  CareerFormulaPreviewSchema,
  PreviewCareerRollupSchema,
  CareerRollupPreviewSchema,
  formatResourceEtag,
  parseResourceEtag,
  UuidSchema,
} from "@expresso/contracts";
import type {
  FastifyInstance,
  FastifyRequest,
  preHandlerHookHandler,
} from "fastify";
import { z } from "zod";

import { HttpStatusError, requireAuth } from "../../api/plugins/auth-context.js";
import { type CareerApi } from "./index.js";
import {
  CareerViewCreateSchema,
  CareerViewDuplicateSchema,
  CareerViewQueryInputSchema,
  CareerViewReorderSchema,
  CareerViewUpdateSchema,
} from "./views.js";

const CareerViewIdParamsSchema = z.strictObject({ viewId: UuidSchema });
const CareerViewResponseSchema = z.strictObject({ data: CareerViewConfigurationSchema });
const CareerViewListResponseSchema = z.strictObject({ data: z.array(CareerViewConfigurationSchema) });
const CareerViewPageResponseSchema = z.strictObject({
  data: z.array(CareerRecordSchema),
  page: z.strictObject({ hasNextPage: z.boolean(), nextCursor: z.string().nullable() }),
});

export interface RegisterCareerRoutesOptions {
  careerService: CareerApi;
  authenticateRequest: preHandlerHookHandler;
}

function parseParams<T>(
  schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } },
  request: FastifyRequest,
): T {
  const parsed = schema.safeParse(request.params);
  if (!parsed.success) throw new HttpStatusError(400, "invalid route parameters");
  return parsed.data;
}

function parseBody<T>(
  schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } },
  request: FastifyRequest,
): T {
  const parsed = schema.safeParse(request.body);
  if (!parsed.success) throw new HttpStatusError(400, "invalid request body");
  return parsed.data;
}

function expectedVersion(request: FastifyRequest): number {
  const header = request.headers["if-match"];
  if (typeof header !== "string") {
    throw new HttpStatusError(400, "If-Match is required");
  }
  try {
    return parseResourceEtag(header);
  } catch {
    throw new HttpStatusError(400, "invalid If-Match header");
  }
}

function recordResponse(record: Awaited<ReturnType<CareerApi["getRecord"]>>) {
  return CareerRecordResponseSchema.parse({
    data: record,
    resource: { version: record.version, updatedAt: record.updatedAt },
  });
}

export function registerCareerRoutes(
  app: FastifyInstance,
  options: RegisterCareerRoutesOptions,
): void {
  const preHandler = options.authenticateRequest;
  const scoped=new WeakMap<FastifyRequest,CareerApi>();
  const serviceFor=(request:FastifyRequest):CareerApi=>{
    if(!options.careerService.forSession)return options.careerService;
    const existing=scoped.get(request);if(existing)return existing;
    const principal=requireAuth(request),authorization=request.headers.authorization;
    const match=typeof authorization==="string"?/^Bearer (exps_[A-Za-z0-9_-]{43})$/.exec(authorization):null;
    if(!match)throw new HttpStatusError(401,"opaque user session required");
    const bound=options.careerService.forSession(match[1]!,principal.user.id);
    scoped.set(request,bound);return bound;
  };

  app.get(`${API_PREFIX}/career/write-operations/:operationId`,{preHandler},async request=>{
    const principal=requireAuth(request),service=serviceFor(request),{operationId}=parseParams(z.strictObject({operationId:UuidSchema}),request);
    if(!service.getWriteOperation)throw new HttpStatusError(503,"Career write operation status is unavailable");
    return CareerWriteOperationResponseSchema.parse(await service.getWriteOperation(principal.user.id,operationId));
  });
  app.get(`${API_PREFIX}/career/property-mutations/:mutationId`,{preHandler},async request=>{
    const principal=requireAuth(request),service=serviceFor(request),{mutationId}=parseParams(z.strictObject({mutationId:UuidSchema}),request);
    if(!service.getPropertyMutationStatus)throw new HttpStatusError(503,"property mutation status is unavailable");
    return CareerPropertyMutationStatusResponseSchema.parse(await service.getPropertyMutationStatus(principal.user.id,mutationId));
  });
  app.post(`${API_PREFIX}/career/property-mutations/:mutationId/resume`,{preHandler},async request=>{
    const principal=requireAuth(request),service=serviceFor(request),{mutationId}=parseParams(z.strictObject({mutationId:UuidSchema}),request);
    parseBody(CareerResumePropertyMutationSchema,request);
    if(!service.resumePropertyMutation)throw new HttpStatusError(503,"property mutation resume is unavailable");
    return CareerPropertyMutationStatusResponseSchema.parse(await service.resumePropertyMutation(principal.user.id,mutationId));
  });
  /**
   * 온보딩 1단계가 정한 것 — 노리는 자리, 연차, 지금 급한 것.
   *
   * 지나지 않은 사람에게는 `null`이다. 없는 것을 기본값으로 꾸며 돌려주면
   * 화면이 "이 사람은 백엔드 5년"이라고 믿게 된다 — 아무도 그렇게 말한 적 없다.
   */
  app.get(`${API_PREFIX}/career/profile`, { preHandler }, async (request) => {
    const principal = requireAuth(request);
    const service = serviceFor(request);
    return OptionalCareerProfileResponseSchema.parse({
      data: await service.getProfile(principal.user.id),
    });
  });

  /** 통째로 덮어쓴다. 몇 번을 보내도 결과가 같다. */
  app.put(`${API_PREFIX}/career/profile`, { preHandler }, async (request) => {
    const principal = requireAuth(request);
    const service = serviceFor(request);
    const input = parseBody(SaveCareerProfileSchema, request);
    return CareerProfileResponseSchema.parse({
      data: await service.saveProfile(principal.user.id, input),
    });
  });

  app.get(`${API_PREFIX}/career/categories`, { preHandler }, async (request) => {
    const principal = requireAuth(request);
    const service = serviceFor(request);
    return CareerCategoriesResponseSchema.parse({
      data: await service.listCategories(principal.user.id),
    });
  });

  app.post(`${API_PREFIX}/career/categories`, { preHandler }, async (request, reply) => {
    const principal = requireAuth(request);
    const service = serviceFor(request);
    const input = parseBody(CreateCareerCategorySchema, request);
    const category = await service.createCategory(
      principal.user.id,
      input,
    );
    return reply.code(201).header("etag", formatResourceEtag(category.version)).send({
      data: category,
    });
  });

  app.post(`${API_PREFIX}/career/categories/:categoryId/property-schema/preview`, { preHandler }, async (request) => {
    const principal = requireAuth(request);
    const service = serviceFor(request);
    const { categoryId } = parseParams(CareerCategoryIdParamsSchema, request);
    const change = parseBody(CareerPropertySchemaChangeSchema, request);
    if (!service.previewChange) throw new HttpStatusError(501, "property schema v2 is unavailable");
    const preview = await service.previewChange(principal.user.id, categoryId, change);
    return { data: CareerPropertyChangePreviewSchema.parse(preview) };
  });
  app.post(`${API_PREFIX}/career/categories/:categoryId/property-schema/apply`, { preHandler }, async (request, reply) => {
    const principal = requireAuth(request);
    const service = serviceFor(request);
    const { categoryId } = parseParams(CareerCategoryIdParamsSchema, request);
    const key = IdempotencyKeySchema.safeParse(request.headers["idempotency-key"]);
    if (!key.success) throw new HttpStatusError(400, "Idempotency-Key is required");
    const input = parseBody(ApplyCareerPropertyChangeSchema, request);
    if (!service.applyChange) throw new HttpStatusError(501, "property schema v2 is unavailable");
    const category = await service.applyChange(principal.user.id, categoryId, expectedVersion(request), key.data, input);
    return reply.header("etag", formatResourceEtag(category.version)).send({ data: category });
  });
  app.post(`${API_PREFIX}/career/categories/:categoryId/property-schema/:propertyId/options`, { preHandler }, async (request) => {
    const principal = requireAuth(request);
    const service = serviceFor(request);
    const { categoryId, propertyId } = parseParams(CareerCategoryIdParamsSchema.extend({ propertyId: UuidSchema }), request);
    const input = parseBody(CareerRegisterPropertyOptionSchema, request);
    if (!service.registerPropertyOption) throw new HttpStatusError(503, "private Career options are unavailable");
    return CareerPropertyOptionResponseSchema.parse(await service.registerPropertyOption(principal.user.id, categoryId, propertyId, input));
  });
  app.post(`${API_PREFIX}/career/categories/:categoryId/property-schema/:propertyId/restore`, { preHandler }, async (request, reply) => {
    const principal = requireAuth(request);
    const service = serviceFor(request);
    const { categoryId } = parseParams(CareerCategoryIdParamsSchema, request);
    const params = parseParams(CareerCategoryIdParamsSchema.extend({ propertyId: UuidSchema }), request);
    if (!service.restoreProperty) throw new HttpStatusError(501, "property schema v2 is unavailable");
    const category = await service.restoreProperty(principal.user.id, categoryId, params.propertyId, expectedVersion(request));
    return reply.header("etag", formatResourceEtag(category.version)).send({ data: category });
  });

  app.get(`${API_PREFIX}/career/categories/:categoryId/view-configurations`, { preHandler }, async (request) => {
    const principal = requireAuth(request);
    const service = serviceFor(request);
    const { categoryId } = parseParams(CareerCategoryIdParamsSchema, request);
    if (!service.listViewConfigurations) throw new HttpStatusError(501, "career view configurations are unavailable");
    return CareerViewListResponseSchema.parse({ data: await service.listViewConfigurations(principal.user.id, categoryId) });
  });

  app.post(`${API_PREFIX}/career/categories/:categoryId/view-configurations`, { preHandler }, async (request, reply) => {
    const principal = requireAuth(request);
    const service = serviceFor(request);
    const { categoryId } = parseParams(CareerCategoryIdParamsSchema, request);
    const input = parseBody(CareerViewCreateSchema, request);
    if (!service.createViewConfiguration) throw new HttpStatusError(501, "career view configurations are unavailable");
    const view = await service.createViewConfiguration(principal.user.id, categoryId, expectedVersion(request), input);
    return reply.code(201).header("etag", formatResourceEtag(view.version)).send(CareerViewResponseSchema.parse({ data: view }));
  });

  app.post(`${API_PREFIX}/career/categories/:categoryId/view-configurations/reorder`, { preHandler }, async (request) => {
    const principal = requireAuth(request);
    const service = serviceFor(request);
    const { categoryId } = parseParams(CareerCategoryIdParamsSchema, request);
    const input = parseBody(CareerViewReorderSchema, request);
    if (!service.reorderViewConfigurations) throw new HttpStatusError(501, "career view configurations are unavailable");
    return CareerViewListResponseSchema.parse({ data: await service.reorderViewConfigurations(principal.user.id, categoryId, expectedVersion(request), input.orderedIds) });
  });

  app.patch(`${API_PREFIX}/career/view-configurations/:viewId`, { preHandler }, async (request, reply) => {
    const principal = requireAuth(request);
    const service = serviceFor(request);
    const { viewId } = parseParams(CareerViewIdParamsSchema, request);
    const input = parseBody(CareerViewUpdateSchema, request);
    if (!service.updateViewConfiguration) throw new HttpStatusError(501, "career view configurations are unavailable");
    const view = await service.updateViewConfiguration(principal.user.id, viewId, expectedVersion(request), input);
    return reply.header("etag", formatResourceEtag(view.version)).send(CareerViewResponseSchema.parse({ data: view }));
  });

  app.post(`${API_PREFIX}/career/view-configurations/:viewId/duplicate`, { preHandler }, async (request, reply) => {
    const principal = requireAuth(request);
    const service = serviceFor(request);
    const { viewId } = parseParams(CareerViewIdParamsSchema, request);
    const input = parseBody(CareerViewDuplicateSchema, request);
    if (!service.duplicateViewConfiguration) throw new HttpStatusError(501, "career view configurations are unavailable");
    const view = await service.duplicateViewConfiguration(principal.user.id, viewId, expectedVersion(request), input.name);
    return reply.code(201).header("etag", formatResourceEtag(view.version)).send(CareerViewResponseSchema.parse({ data: view }));
  });

  app.delete(`${API_PREFIX}/career/view-configurations/:viewId`, { preHandler }, async (request, reply) => {
    const principal = requireAuth(request);
    const service = serviceFor(request);
    const { viewId } = parseParams(CareerViewIdParamsSchema, request);
    if (!service.deleteViewConfiguration) throw new HttpStatusError(501, "career view configurations are unavailable");
    await service.deleteViewConfiguration(principal.user.id, viewId, expectedVersion(request));
    return reply.code(204).send();
  });

  app.get(`${API_PREFIX}/career/view-configurations/:viewId/query`, { preHandler }, async (request) => {
    const principal = requireAuth(request);
    const service = serviceFor(request);
    const { viewId } = parseParams(CareerViewIdParamsSchema, request);
    const input = CareerViewQueryInputSchema.safeParse(request.query);
    if (!input.success) throw new HttpStatusError(400, "invalid career view query");
    if (!service.queryViewConfiguration) throw new HttpStatusError(501, "career view configurations are unavailable");
    return CareerViewPageResponseSchema.parse(await service.queryViewConfiguration(principal.user.id, viewId, input.data.cursor, input.data.limit));
  });

  app.get(`${API_PREFIX}/career/records`, { preHandler }, async (request) => {
    const principal = requireAuth(request);
    const service = serviceFor(request);
    const parsed = ListCareerRecordsQuerySchema.safeParse(request.query);
    if (!parsed.success) throw new HttpStatusError(400, "invalid query parameters");
    return service.listRecords(principal.user.id, parsed.data);
  });

  app.post(`${API_PREFIX}/career/records`, { preHandler }, async (request, reply) => {
    const principal = requireAuth(request);
    const service = serviceFor(request);
    const key = IdempotencyKeySchema.safeParse(
      request.headers["idempotency-key"],
    );
    if (!key.success) throw new HttpStatusError(400, "Idempotency-Key is required");
    const input = parseBody(CreateCareerRecordSchema, request);
    if(service.createRecordOperation){
      const result=await service.createRecordOperation(principal.user.id,key.data,input);
      if(result.status===202){
        const pending=CareerWriteOperationResponseSchema.parse(result.body);
        if(pending.data.producer!=="career-product"||!["pending","running","retry"].includes(pending.data.state))throw new HttpStatusError(503,"Career unfinished operation result is invalid");
        return reply.code(202).header("location",pending.data.statusUrl).send(pending);
      }
      const completed=CareerRecordResponseSchema.parse(result.body);
      return reply.code(result.status).header("etag",formatResourceEtag(completed.resource.version)).send(completed);
    }
    const result = await service.createRecord(
      principal.user.id,
      key.data,
      input,
    );
    return reply
      .code(result.created ? 201 : 200)
      .header("etag", formatResourceEtag(result.record.version))
      .send(recordResponse(result.record));
  });

  app.get(
    `${API_PREFIX}/career/records/:recordId`,
    { preHandler },
    async (request, reply) => {
      const principal = requireAuth(request);
    const service = serviceFor(request);
      const { recordId } = parseParams(CareerRecordIdParamsSchema, request);
      const record = await service.getRecord(principal.user.id, recordId);
      return reply
        .header("etag", formatResourceEtag(record.version))
        .send(recordResponse(record));
    },
  );

  app.patch(
    `${API_PREFIX}/career/records/:recordId`,
    { preHandler },
    async (request, reply) => {
      const principal = requireAuth(request);
    const service = serviceFor(request);
      const { recordId } = parseParams(CareerRecordIdParamsSchema, request);
      const input = parseBody(UpdateCareerRecordSchema, request);
      if(service.updateRecordOperation){
        const result=await service.updateRecordOperation(principal.user.id,recordId,expectedVersion(request),input);
        if(result.status===202){
          const pending=CareerWriteOperationResponseSchema.parse(result.body);
          if(pending.data.producer!=="career-product"||!["pending","running","retry"].includes(pending.data.state))throw new HttpStatusError(503,"Career unfinished operation result is invalid");
          return reply.code(202).header("location",pending.data.statusUrl).send(pending);
        }
        const completed=CareerRecordResponseSchema.parse(result.body);
        return reply.code(200).header("etag",formatResourceEtag(completed.resource.version)).send(completed);
      }
      const record = await service.updateRecord(
        principal.user.id,
        recordId,
        expectedVersion(request),
        input,
      );
      return reply
        .header("etag", formatResourceEtag(record.version))
        .send(recordResponse(record));
    },
  );

  app.delete(
    `${API_PREFIX}/career/records/:recordId`,
    { preHandler },
    async (request) => {
      const principal = requireAuth(request);
    const service = serviceFor(request);
      const { recordId } = parseParams(CareerRecordIdParamsSchema, request);
      return {
        data: await service.trashRecord(principal.user.id, recordId),
      };
    },
  );

  app.get(
    `${API_PREFIX}/career/records/:recordId/delete-impact`,
    { preHandler },
    async (request) => {
      const principal = requireAuth(request);
    const service = serviceFor(request);
      const { recordId } = parseParams(CareerRecordIdParamsSchema, request);
      return {
        data: await service.getDeleteImpact(
          principal.user.id,
          recordId,
        ),
      };
    },
  );

  app.post(
    `${API_PREFIX}/career/records/:recordId/restore`,
    { preHandler },
    async (request, reply) => {
      const principal = requireAuth(request);
    const service = serviceFor(request);
      const { recordId } = parseParams(CareerRecordIdParamsSchema, request);
      const record = await service.restoreRecord(
        principal.user.id,
        recordId,
      );
      return reply
        .header("etag", formatResourceEtag(record.version))
        .send(recordResponse(record));
    },
  );

  app.put(`${API_PREFIX}/career/records/:recordId/relations`, { preHandler }, async (request, reply) => {
    const principal = requireAuth(request);
    const service = serviceFor(request);
    const { recordId } = parseParams(CareerRecordIdParamsSchema, request);
    const input = parseBody(ReplaceCareerRelationTargetsSchema, request);
    if (!service.replaceTargets) throw new HttpStatusError(501, "career relations are unavailable");
    const record = await service.replaceTargets(principal.user.id, recordId, input.propertyId, input.targetIds, expectedVersion(request));
    return reply.header("etag", formatResourceEtag(record.version)).send(recordResponse(record));
  });

  app.get(`${API_PREFIX}/career/records/:recordId/relations`, { preHandler }, async (request) => {
    const principal = requireAuth(request);
    const service = serviceFor(request);
    const { recordId } = parseParams(CareerRecordIdParamsSchema, request);
    const query = ListCareerRelationTargetsQuerySchema.safeParse(request.query);
    if (!query.success) throw new HttpStatusError(400, "invalid relation target query");
    if (!service.listRelationTargets) throw new HttpStatusError(501, "career relations are unavailable");
    return { data: await service.listRelationTargets(principal.user.id, recordId, query.data.propertyId) };
  });

  app.post(`${API_PREFIX}/career/records/:recordId/move/preview`, { preHandler }, async (request) => {
    const principal = requireAuth(request);
    const service = serviceFor(request);
    const { recordId } = parseParams(CareerRecordIdParamsSchema, request);
    const input = parseBody(PreviewCareerCategoryMoveSchema, request);
    if (!service.previewCategoryMove) throw new HttpStatusError(501, "career category move is unavailable");
    return { data: CareerCategoryMovePreviewSchema.parse(await service.previewCategoryMove(principal.user.id, recordId, input.targetCategoryId)) };
  });

  app.post(`${API_PREFIX}/career/records/:recordId/move`, { preHandler }, async (request, reply) => {
    const principal = requireAuth(request);
    const service = serviceFor(request);
    const { recordId } = parseParams(CareerRecordIdParamsSchema, request);
    const input = CareerCategoryMoveCommitSchema.parse({ ...parseBody(CommitCareerCategoryMoveRequestSchema, request), recordId });
    if (expectedVersion(request) !== input.expectedVersion) throw new HttpStatusError(400, "If-Match and expectedVersion must agree");
    if (!service.commitCategoryMove) throw new HttpStatusError(501, "career category move is unavailable");
    const record = await service.commitCategoryMove(principal.user.id, recordId, input);
    return reply.header("etag", formatResourceEtag(record.version)).send(recordResponse(record));
  });

  app.post(`${API_PREFIX}/career/formulas/preview`, { preHandler }, async (request) => {
    const principal = requireAuth(request);
    const service = serviceFor(request);
    const input = parseBody(PreviewCareerFormulaSchema, request);
    if (!service.previewFormula) throw new HttpStatusError(501, "career formula preview is unavailable");
    return { data: CareerFormulaPreviewSchema.parse(await service.previewFormula(principal.user.id, input)) };
  });

  app.post(`${API_PREFIX}/career/rollups/preview`, { preHandler }, async (request) => {
    const principal = requireAuth(request);
    const service = serviceFor(request);
    const input = parseBody(PreviewCareerRollupSchema, request);
    if (!service.previewRollup) throw new HttpStatusError(501, "career rollup preview is unavailable");
    return { data: CareerRollupPreviewSchema.parse(await service.previewRollup(principal.user.id, input)) };
  });

  app.post(
    `${API_PREFIX}/career/records/:recordId/links`,
    { preHandler },
    async (request, reply) => {
      const principal = requireAuth(request);
    const service = serviceFor(request);
      const { recordId } = parseParams(CareerRecordIdParamsSchema, request);
      const input = parseBody(CreateCareerRecordLinkSchema, request);
      const link = await service.createLink(
        principal.user.id,
        recordId,
        input.toRecordId,
        input.relation,
      );
      return reply.code(201).send({ data: link });
    },
  );

  app.get(
    `${API_PREFIX}/career/records/:recordId/links`,
    { preHandler },
    async (request) => {
      const principal = requireAuth(request);
    const service = serviceFor(request);
      const { recordId } = parseParams(CareerRecordIdParamsSchema, request);
      return {
        data: await service.listLinks(principal.user.id, recordId),
      };
    },
  );

  app.post(
    `${API_PREFIX}/career/skills/recompute`,
    { preHandler },
    async (request) => {
      const principal = requireAuth(request);
    const service = serviceFor(request);
      const input = parseBody(RecomputeCareerSkillSchema, request);
      return {
        data: await service.recomputeSkill(principal.user.id, input),
      };
    },
  );

  app.get(`${API_PREFIX}/career/skills`, { preHandler }, async (request) => {
    const principal = requireAuth(request);
    const service = serviceFor(request);
    return { data: await service.listSkills(principal.user.id) };
  });

  app.get(
    `${API_PREFIX}/career/skills/:skillId/evidence`,
    { preHandler },
    async (request) => {
      const principal = requireAuth(request);
    const service = serviceFor(request);
      const { skillId } = parseParams(CareerSkillIdParamsSchema, request);
      return CareerSkillEvidenceResponseSchema.parse({
        data: await service.listSkillEvidence(
          principal.user.id,
          skillId,
        ),
      });
    },
  );
}
