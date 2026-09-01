import {
  API_PREFIX,
  BrewCompanyResearchParamsSchema,
  ReplaceCompanyResearchSchema,
} from "@expresso/contracts";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";

import { HttpStatusError, requireAuth } from "../../api/plugins/auth-context.js";
import { CompanyResearchError, type CompanyResearchApi } from "./index.js";

export function registerCompanyResearchRoutes(
  app: FastifyInstance,
  options: {
    service: CompanyResearchApi;
    authenticateRequest: preHandlerHookHandler;
  },
): void {
  const path = `${API_PREFIX}/brews/:brewId/company-research`;

  app.get(path, { preHandler: options.authenticateRequest }, async (request) => {
    const principal = requireAuth(request);
    const { brewId } = BrewCompanyResearchParamsSchema.parse(request.params);
    return { data: { items: await lift(() => options.service.list(principal.user.id, brewId)) } };
  });

  app.put(path, { preHandler: options.authenticateRequest }, async (request) => {
    const principal = requireAuth(request);
    const { brewId } = BrewCompanyResearchParamsSchema.parse(request.params);
    const input = ReplaceCompanyResearchSchema.parse(request.body);
    return { data: { items: await lift(() => options.service.replace(principal.user.id, brewId, input)) } };
  });
}

async function lift<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof CompanyResearchError) {
      throw new HttpStatusError(error.statusCode, error.message);
    }
    throw error;
  }
}
