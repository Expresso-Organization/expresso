import {
  API_PREFIX,
  AppendCareerUpdateSchema,
  CareerDocumentBootstrapSchema,
  CareerRevisionsResponseSchema,
  CareerUpdateAckSchema,
  RestoreCareerRevisionSchema,
  UuidSchema,
} from "@expresso/contracts";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";

import { requireAuth } from "../../api/plugins/auth-context.js";
import type { CareerDocumentApi } from "./service.js";

interface CareerDocumentRouteOptions {
  service: CareerDocumentApi;
  authenticateRequest: preHandlerHookHandler;
}

export function registerCareerDocumentRoutes(
  app: FastifyInstance,
  options: CareerDocumentRouteOptions,
) {
  app.get(
    `${API_PREFIX}/career/records/:recordId/document`,
    { preHandler: options.authenticateRequest },
    async (request) => {
      const recordId = UuidSchema.parse((request.params as { recordId: string }).recordId);
      return CareerDocumentBootstrapSchema.parse(
        await options.service.bootstrap(requireAuth(request).user.id, recordId),
      );
    },
  );
  app.post(
    `${API_PREFIX}/career/records/:recordId/document/updates`,
    { preHandler: options.authenticateRequest },
    async (request) => {
      const body = AppendCareerUpdateSchema.parse({
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
      const recordId = UuidSchema.parse((request.params as { recordId: string }).recordId);
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
      const recordId = UuidSchema.parse(params.recordId);
      const revisionId = UuidSchema.parse(params.revisionId);
      const body = RestoreCareerRevisionSchema.parse(request.body);
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
}
