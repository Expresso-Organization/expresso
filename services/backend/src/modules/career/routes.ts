import {
  API_PREFIX,
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
  CreateCareerViewSchema,
  IdempotencyKeySchema,
  ListCareerRecordsQuerySchema,
  RecomputeCareerSkillSchema,
  UpdateCareerPropertySchemaSchema,
  UpdateCareerRecordSchema,
  CareerPropertySchemaChangeSchema,
  ApplyCareerPropertyChangeSchema,
  CareerPropertyChangePreviewSchema,
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

  /**
   * 온보딩 1단계가 정한 것 — 노리는 자리, 연차, 지금 급한 것.
   *
   * 지나지 않은 사람에게는 `null`이다. 없는 것을 기본값으로 꾸며 돌려주면
   * 화면이 "이 사람은 백엔드 5년"이라고 믿게 된다 — 아무도 그렇게 말한 적 없다.
   */
  app.get(`${API_PREFIX}/career/profile`, { preHandler }, async (request) => {
    const principal = requireAuth(request);
    return OptionalCareerProfileResponseSchema.parse({
      data: await options.careerService.getProfile(principal.user.id),
    });
  });

  /** 통째로 덮어쓴다. 몇 번을 보내도 결과가 같다. */
  app.put(`${API_PREFIX}/career/profile`, { preHandler }, async (request) => {
    const principal = requireAuth(request);
    const input = parseBody(SaveCareerProfileSchema, request);
    return CareerProfileResponseSchema.parse({
      data: await options.careerService.saveProfile(principal.user.id, input),
    });
  });

  app.get(`${API_PREFIX}/career/categories`, { preHandler }, async (request) => {
    const principal = requireAuth(request);
    return CareerCategoriesResponseSchema.parse({
      data: await options.careerService.listCategories(principal.user.id),
    });
  });

  app.post(`${API_PREFIX}/career/categories`, { preHandler }, async (request, reply) => {
    const principal = requireAuth(request);
    const input = parseBody(CreateCareerCategorySchema, request);
    const category = await options.careerService.createCategory(
      principal.user.id,
      input,
    );
    return reply.code(201).header("etag", formatResourceEtag(category.version)).send({
      data: category,
    });
  });

  app.patch(
    `${API_PREFIX}/career/categories/:categoryId/property-schema`,
    { preHandler },
    async (request, reply) => {
      const principal = requireAuth(request);
      const { categoryId } = parseParams(CareerCategoryIdParamsSchema, request);
      const input = parseBody(UpdateCareerPropertySchemaSchema, request);
      const category = await options.careerService.updatePropertySchema(
        principal.user.id,
        categoryId,
        expectedVersion(request),
        input.propertySchema,
        input.confirmValueRemoval,
      );
      return reply.header("etag", formatResourceEtag(category.version)).send({
        data: category,
      });
    },
  );

  app.post(`${API_PREFIX}/career/categories/:categoryId/property-schema/preview`, { preHandler }, async (request) => {
    const principal = requireAuth(request);
    const { categoryId } = parseParams(CareerCategoryIdParamsSchema, request);
    const change = parseBody(CareerPropertySchemaChangeSchema, request);
    if (!options.careerService.previewChange) throw new HttpStatusError(501, "property schema v2 is unavailable");
    const preview = await options.careerService.previewChange(principal.user.id, categoryId, change);
    return { data: CareerPropertyChangePreviewSchema.parse(preview) };
  });
  app.post(`${API_PREFIX}/career/categories/:categoryId/property-schema/apply`, { preHandler }, async (request, reply) => {
    const principal = requireAuth(request);
    const { categoryId } = parseParams(CareerCategoryIdParamsSchema, request);
    const key = IdempotencyKeySchema.safeParse(request.headers["idempotency-key"]);
    if (!key.success) throw new HttpStatusError(400, "Idempotency-Key is required");
    const input = parseBody(ApplyCareerPropertyChangeSchema, request);
    if (!options.careerService.applyChange) throw new HttpStatusError(501, "property schema v2 is unavailable");
    const category = await options.careerService.applyChange(principal.user.id, categoryId, expectedVersion(request), key.data, input);
    return reply.header("etag", formatResourceEtag(category.version)).send({ data: category });
  });
  app.post(`${API_PREFIX}/career/categories/:categoryId/property-schema/:propertyId/restore`, { preHandler }, async (request, reply) => {
    const principal = requireAuth(request);
    const { categoryId } = parseParams(CareerCategoryIdParamsSchema, request);
    const params = parseParams(CareerCategoryIdParamsSchema.extend({ propertyId: UuidSchema }), request);
    if (!options.careerService.restoreProperty) throw new HttpStatusError(501, "property schema v2 is unavailable");
    const category = await options.careerService.restoreProperty(principal.user.id, categoryId, params.propertyId, expectedVersion(request));
    return reply.header("etag", formatResourceEtag(category.version)).send({ data: category });
  });

  app.get(
    `${API_PREFIX}/career/categories/:categoryId/views`,
    { preHandler },
    async (request) => {
      const principal = requireAuth(request);
      const { categoryId } = parseParams(CareerCategoryIdParamsSchema, request);
      return {
        data: await options.careerService.listViews(principal.user.id, categoryId),
      };
    },
  );

  app.post(
    `${API_PREFIX}/career/categories/:categoryId/views`,
    { preHandler },
    async (request, reply) => {
      const principal = requireAuth(request);
      const { categoryId } = parseParams(CareerCategoryIdParamsSchema, request);
      const input = parseBody(CreateCareerViewSchema, request);
      const view = await options.careerService.createView(
        principal.user.id,
        categoryId,
        input,
      );
      return reply.code(201).send({ data: view });
    },
  );

  // 기존 `/views` 응답은 전환 기간 동안 그대로 둔다. 새 화면은 UUID 기반 설정 API만 사용한다.
  app.get(`${API_PREFIX}/career/categories/:categoryId/view-configurations`, { preHandler }, async (request) => {
    const principal = requireAuth(request);
    const { categoryId } = parseParams(CareerCategoryIdParamsSchema, request);
    if (!options.careerService.listViewConfigurations) throw new HttpStatusError(501, "career view configurations are unavailable");
    return CareerViewListResponseSchema.parse({ data: await options.careerService.listViewConfigurations(principal.user.id, categoryId) });
  });

  app.post(`${API_PREFIX}/career/categories/:categoryId/view-configurations`, { preHandler }, async (request, reply) => {
    const principal = requireAuth(request);
    const { categoryId } = parseParams(CareerCategoryIdParamsSchema, request);
    const input = parseBody(CareerViewCreateSchema, request);
    if (!options.careerService.createViewConfiguration) throw new HttpStatusError(501, "career view configurations are unavailable");
    const view = await options.careerService.createViewConfiguration(principal.user.id, categoryId, expectedVersion(request), input);
    return reply.code(201).header("etag", formatResourceEtag(view.version)).send(CareerViewResponseSchema.parse({ data: view }));
  });

  app.post(`${API_PREFIX}/career/categories/:categoryId/view-configurations/reorder`, { preHandler }, async (request) => {
    const principal = requireAuth(request);
    const { categoryId } = parseParams(CareerCategoryIdParamsSchema, request);
    const input = parseBody(CareerViewReorderSchema, request);
    if (!options.careerService.reorderViewConfigurations) throw new HttpStatusError(501, "career view configurations are unavailable");
    return CareerViewListResponseSchema.parse({ data: await options.careerService.reorderViewConfigurations(principal.user.id, categoryId, expectedVersion(request), input.orderedIds) });
  });

  app.patch(`${API_PREFIX}/career/view-configurations/:viewId`, { preHandler }, async (request, reply) => {
    const principal = requireAuth(request);
    const { viewId } = parseParams(CareerViewIdParamsSchema, request);
    const input = parseBody(CareerViewUpdateSchema, request);
    if (!options.careerService.updateViewConfiguration) throw new HttpStatusError(501, "career view configurations are unavailable");
    const view = await options.careerService.updateViewConfiguration(principal.user.id, viewId, expectedVersion(request), input);
    return reply.header("etag", formatResourceEtag(view.version)).send(CareerViewResponseSchema.parse({ data: view }));
  });

  app.post(`${API_PREFIX}/career/view-configurations/:viewId/duplicate`, { preHandler }, async (request, reply) => {
    const principal = requireAuth(request);
    const { viewId } = parseParams(CareerViewIdParamsSchema, request);
    const input = parseBody(CareerViewDuplicateSchema, request);
    if (!options.careerService.duplicateViewConfiguration) throw new HttpStatusError(501, "career view configurations are unavailable");
    const view = await options.careerService.duplicateViewConfiguration(principal.user.id, viewId, expectedVersion(request), input.name);
    return reply.code(201).header("etag", formatResourceEtag(view.version)).send(CareerViewResponseSchema.parse({ data: view }));
  });

  app.delete(`${API_PREFIX}/career/view-configurations/:viewId`, { preHandler }, async (request, reply) => {
    const principal = requireAuth(request);
    const { viewId } = parseParams(CareerViewIdParamsSchema, request);
    if (!options.careerService.deleteViewConfiguration) throw new HttpStatusError(501, "career view configurations are unavailable");
    await options.careerService.deleteViewConfiguration(principal.user.id, viewId, expectedVersion(request));
    return reply.code(204).send();
  });

  app.get(`${API_PREFIX}/career/view-configurations/:viewId/query`, { preHandler }, async (request) => {
    const principal = requireAuth(request);
    const { viewId } = parseParams(CareerViewIdParamsSchema, request);
    const input = CareerViewQueryInputSchema.safeParse(request.query);
    if (!input.success) throw new HttpStatusError(400, "invalid career view query");
    if (!options.careerService.queryViewConfiguration) throw new HttpStatusError(501, "career view configurations are unavailable");
    return CareerViewPageResponseSchema.parse(await options.careerService.queryViewConfiguration(principal.user.id, viewId, input.data.cursor, input.data.limit));
  });

  app.get(`${API_PREFIX}/career/records`, { preHandler }, async (request) => {
    const principal = requireAuth(request);
    const parsed = ListCareerRecordsQuerySchema.safeParse(request.query);
    if (!parsed.success) throw new HttpStatusError(400, "invalid query parameters");
    return options.careerService.listRecords(principal.user.id, parsed.data);
  });

  app.post(`${API_PREFIX}/career/records`, { preHandler }, async (request, reply) => {
    const principal = requireAuth(request);
    const key = IdempotencyKeySchema.safeParse(
      request.headers["idempotency-key"],
    );
    if (!key.success) throw new HttpStatusError(400, "Idempotency-Key is required");
    const input = parseBody(CreateCareerRecordSchema, request);
    const result = await options.careerService.createRecord(
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
      const { recordId } = parseParams(CareerRecordIdParamsSchema, request);
      const record = await options.careerService.getRecord(principal.user.id, recordId);
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
      const { recordId } = parseParams(CareerRecordIdParamsSchema, request);
      const input = parseBody(UpdateCareerRecordSchema, request);
      const record = await options.careerService.updateRecord(
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
      const { recordId } = parseParams(CareerRecordIdParamsSchema, request);
      return {
        data: await options.careerService.trashRecord(principal.user.id, recordId),
      };
    },
  );

  app.get(
    `${API_PREFIX}/career/records/:recordId/delete-impact`,
    { preHandler },
    async (request) => {
      const principal = requireAuth(request);
      const { recordId } = parseParams(CareerRecordIdParamsSchema, request);
      return {
        data: await options.careerService.getDeleteImpact(
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
      const { recordId } = parseParams(CareerRecordIdParamsSchema, request);
      const record = await options.careerService.restoreRecord(
        principal.user.id,
        recordId,
      );
      return reply
        .header("etag", formatResourceEtag(record.version))
        .send(recordResponse(record));
    },
  );

  app.post(
    `${API_PREFIX}/career/records/:recordId/links`,
    { preHandler },
    async (request, reply) => {
      const principal = requireAuth(request);
      const { recordId } = parseParams(CareerRecordIdParamsSchema, request);
      const input = parseBody(CreateCareerRecordLinkSchema, request);
      const link = await options.careerService.createLink(
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
      const { recordId } = parseParams(CareerRecordIdParamsSchema, request);
      return {
        data: await options.careerService.listLinks(principal.user.id, recordId),
      };
    },
  );

  app.post(
    `${API_PREFIX}/career/skills/recompute`,
    { preHandler },
    async (request) => {
      const principal = requireAuth(request);
      const input = parseBody(RecomputeCareerSkillSchema, request);
      return {
        data: await options.careerService.recomputeSkill(principal.user.id, input),
      };
    },
  );

  app.get(`${API_PREFIX}/career/skills`, { preHandler }, async (request) => {
    const principal = requireAuth(request);
    return { data: await options.careerService.listSkills(principal.user.id) };
  });

  app.get(
    `${API_PREFIX}/career/skills/:skillId/evidence`,
    { preHandler },
    async (request) => {
      const principal = requireAuth(request);
      const { skillId } = parseParams(CareerSkillIdParamsSchema, request);
      return CareerSkillEvidenceResponseSchema.parse({
        data: await options.careerService.listSkillEvidence(
          principal.user.id,
          skillId,
        ),
      });
    },
  );
}
