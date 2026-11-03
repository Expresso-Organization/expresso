import {
  API_PREFIX,
  AppendCareerUpdateSchema,
  CareerDocumentBootstrapSchema,
  CareerRevisionsResponseSchema,
  CareerUpdateAckSchema,
  RestoreCareerRevisionSchema,
  CreateAiEditProposalSchema,
  AiEditProposalDetailSchema,
  AiProposalApplyRequestSchema,
  AiProposalRejectRequestSchema,
  AiProposalCancelRequestSchema,
  AiProposalUndoRequestSchema,
  UuidSchema,
} from "@expresso/contracts";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";

import { requireAuth } from "../../api/plugins/auth-context.js";
import { CareerDocumentError } from "./errors.js";
import type { CareerDocumentApi } from "./service.js";

interface CareerDocumentRouteOptions {
  service: CareerDocumentApi;
  authenticateRequest: preHandlerHookHandler;
}

/** 요청 입력을 계약으로 읽습니다. 틀린 입력은 500이 아니라 400입니다. 응답 계약 위반(서버 결함)은 그대로 500으로 둡니다. */
function parseInput<T>(schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } }, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new CareerDocumentError(400, "invalid request");
  return parsed.data;
}

export function registerCareerDocumentRoutes(
  app: FastifyInstance,
  options: CareerDocumentRouteOptions,
) {
  app.get(
    `${API_PREFIX}/career/records/:recordId/document`,
    { preHandler: options.authenticateRequest },
    async (request) => {
      const recordId = parseInput(UuidSchema, (request.params as { recordId: string }).recordId);
      return CareerDocumentBootstrapSchema.parse(
        await options.service.bootstrap(requireAuth(request).user.id, recordId),
      );
    },
  );
  app.post(
    `${API_PREFIX}/career/records/:recordId/document/updates`,
    { preHandler: options.authenticateRequest },
    async (request) => {
      const body = parseInput(AppendCareerUpdateSchema, {
        ...(request.body as object),
        recordId: (request.params as { recordId: string }).recordId,
      });
      return CareerUpdateAckSchema.parse(
        await options.service.appendUpdate(requireAuth(request).user.id, body),
      );
    },
  );
  app.get(
    `${API_PREFIX}/career/records/:recordId/document/revisions`,
    { preHandler: options.authenticateRequest },
    async (request) => {
      const recordId = parseInput(UuidSchema, (request.params as { recordId: string }).recordId);
      return CareerRevisionsResponseSchema.parse({
        data: await options.service.listRevisions(requireAuth(request).user.id, recordId),
      });
    },
  );
  app.post(
    `${API_PREFIX}/career/records/:recordId/document/revisions/:revisionId/restore`,
    { preHandler: options.authenticateRequest },
    async (request) => {
      const params = request.params as { recordId: string; revisionId: string };
      const recordId = parseInput(UuidSchema, params.recordId);
      const revisionId = parseInput(UuidSchema, params.revisionId);
      const body = parseInput(RestoreCareerRevisionSchema, request.body);
      return CareerDocumentBootstrapSchema.parse(
        await options.service.restoreRevision(
          requireAuth(request).user.id,
          revisionId,
          body.expectedVersion,
          recordId,
        ),
      );
    },
  );
  app.post(`${API_PREFIX}/career/records/:recordId/ai-proposals`, { preHandler: options.authenticateRequest }, async (request, reply) => {
    const recordId = parseInput(UuidSchema, (request.params as { recordId: string }).recordId);
    const proposal = await options.service.createAiProposal(requireAuth(request).user.id, recordId, parseInput(CreateAiEditProposalSchema, request.body));
    return reply.code(202).send({ data: AiEditProposalDetailSchema.parse(proposal) });
  });
  app.get(`${API_PREFIX}/career/records/:recordId/ai-proposals/:proposalId`, { preHandler: options.authenticateRequest }, async (request) => {
    const params = request.params as { recordId: string; proposalId: string };
    return { data: AiEditProposalDetailSchema.parse(await options.service.getAiProposal(requireAuth(request).user.id, parseInput(UuidSchema, params.recordId), parseInput(UuidSchema, params.proposalId))) };
  });
  app.post(`${API_PREFIX}/career/records/:recordId/ai-proposals/:proposalId/apply`, { preHandler: options.authenticateRequest }, async (request) => {
    const params = request.params as { recordId: string; proposalId: string }; const recordId = parseInput(UuidSchema, params.recordId);
    const input = parseInput(AiProposalApplyRequestSchema, { ...(request.body as object), recordId, proposalId: parseInput(UuidSchema, params.proposalId) });
    return { data: AiEditProposalDetailSchema.parse(await options.service.applyAiProposal(requireAuth(request).user.id, recordId, input)) };
  });
  for (const [suffix, schema, method] of [["reject", AiProposalRejectRequestSchema, "rejectAiProposal"], ["cancel", AiProposalCancelRequestSchema, "cancelAiProposal"], ["undo", AiProposalUndoRequestSchema, "undoAiProposal"]] as const) app.post(`${API_PREFIX}/career/records/:recordId/ai-proposals/:proposalId/${suffix}`, { preHandler: options.authenticateRequest }, async (request) => {
    const params = request.params as { recordId: string; proposalId: string }; const recordId = parseInput(UuidSchema, params.recordId);
    const input = parseInput(schema, { ...(request.body as object), recordId, proposalId: parseInput(UuidSchema, params.proposalId) });
    const result = await options.service[method](requireAuth(request).user.id, recordId, input);
    return result === undefined ? { data: null } : "record" in result ? result : { data: AiEditProposalDetailSchema.parse(result) };
  });
}
