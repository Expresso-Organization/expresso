import {
  API_PREFIX,
  CreateBrewSchema,
  CreateFreeBrewSchema,
  UpdateBrewMaterialsSchema,
  UpdateBrewSchema,
} from "@expresso/contracts";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { z } from "zod";

import { HttpStatusError, requireAuth } from "../../api/plugins/auth-context.js";
import { type MaterialsApi } from "./index.js";

const ParamsSchema = z.strictObject({ id: z.uuid() });

export interface RegisterMaterialsRoutesOptions {
  materialsService: MaterialsApi;
  authenticateRequest: preHandlerHookHandler;
}

export function registerMaterialsRoutes(
  app: FastifyInstance,
  options: RegisterMaterialsRoutesOptions,
): void {
  const preHandler = options.authenticateRequest;

  app.post(`${API_PREFIX}/brews`, { preHandler }, async (request, reply) => {
    const principal = requireAuth(request);
    const input = CreateBrewSchema.safeParse(request.body);
    if (!input.success) throw new HttpStatusError(400, "invalid brew request");
    return reply.code(201).send({
      data: await options.materialsService.createBrew(principal.user.id, input.data),
    });
  });

  app.post(`${API_PREFIX}/brews/free`, { preHandler }, async (request, reply) => {
    const principal = requireAuth(request);
    const input = CreateFreeBrewSchema.safeParse(request.body);
    if (!input.success) throw new HttpStatusError(400, "invalid free brew request");
    return reply.code(201).send({
      data: await options.materialsService.createFreeBrew(principal.user.id, input.data),
    });
  });

  app.get(`${API_PREFIX}/brews/:id`, { preHandler }, async (request) => {
    const principal = requireAuth(request);
    const params = ParamsSchema.safeParse(request.params);
    if (!params.success) throw new HttpStatusError(400, "invalid brew ID");
    return { data: await options.materialsService.getState(principal.user.id, params.data.id) };
  });

  app.get(`${API_PREFIX}/brews/:id/materials`, { preHandler }, async (request) => {
    const principal = requireAuth(request);
    const params = ParamsSchema.safeParse(request.params);
    if (!params.success) throw new HttpStatusError(400, "invalid brew ID");
    return {
      data: await options.materialsService.getMaterials(principal.user.id, params.data.id),
    };
  });

  /** 01b 레일의 제작 모드. Cowork는 PRO라 자격을 여기서 본다. */
  app.patch(`${API_PREFIX}/brews/:id`, { preHandler }, async (request) => {
    const principal = requireAuth(request);
    const params = ParamsSchema.safeParse(request.params);
    const input = UpdateBrewSchema.safeParse(request.body);
    if (!params.success || !input.success) throw new HttpStatusError(400, "invalid brew change");
    return {
      data: await options.materialsService.updateBrew(principal.user.id, params.data.id, input.data),
    };
  });

  app.put(`${API_PREFIX}/brews/:id/materials`, { preHandler }, async (request) => {
    const principal = requireAuth(request);
    const params = ParamsSchema.safeParse(request.params);
    const input = UpdateBrewMaterialsSchema.safeParse(request.body);
    if (!params.success || !input.success) {
      throw new HttpStatusError(400, "invalid brew material selection");
    }
    return {
      data: await options.materialsService.updateSelection(
        principal.user.id,
        params.data.id,
        input.data.recordIds,
      ),
    };
  });
}
