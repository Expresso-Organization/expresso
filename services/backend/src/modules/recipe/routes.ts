import { API_PREFIX, IdempotencyKeySchema, RecipeEditSchema } from "@expresso/contracts";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { z } from "zod";

import { HttpStatusError, requireAuth } from "../../api/plugins/auth-context.js";
import type { RecipeService } from "./service.js";
import { BrewJobError, type BrewJobService } from "../brew-jobs/service.js";

const IdParamsSchema = z.strictObject({ id: z.uuid() });
const RestoreParamsSchema = z.strictObject({ id: z.uuid(), revisionId: z.uuid() });
const RestoreBodySchema = z.strictObject({ itemId: z.uuid() });

export function registerRecipeRoutes(
  app: FastifyInstance,
  options: {
    recipeService: RecipeService;
    /** 레시피 생성도 계약을 부른다. 요청 안에서 돌리지 않는다. */
    brewJobService: BrewJobService;
    authenticateRequest: preHandlerHookHandler;
  },
): void {
  const preHandler = options.authenticateRequest;
  app.post(`${API_PREFIX}/brews/:id/recipes`, { preHandler }, async (request, reply) => {
    const principal = requireAuth(request);
    const params = IdParamsSchema.safeParse(request.params);
    const key = IdempotencyKeySchema.safeParse(request.headers["idempotency-key"]);
    if (!params.success || !key.success) throw new HttpStatusError(400, "invalid recipe request");
    // 레시피는 다 짜였을 때 태어난다. 여기서는 잡만 돌려준다.
    try {
      const job = await options.brewJobService.submit(
        principal.user.id, "recipe", key.data, { brewId: params.data.id },
      );
      return reply.code(202).send({ data: job });
    } catch (error) {
      if (error instanceof BrewJobError) throw new HttpStatusError(error.statusCode, error.message);
      throw error;
    }
  });
  app.get(`${API_PREFIX}/recipes/:id`, { preHandler }, async (request) => {
    const principal = requireAuth(request);
    const params = IdParamsSchema.safeParse(request.params);
    if (!params.success) throw new HttpStatusError(400, "invalid recipe ID");
    return { data: await options.recipeService.getRecipe(principal.user.id, params.data.id) };
  });
  app.patch(`${API_PREFIX}/recipes/:id`, { preHandler }, async (request) => {
    const principal = requireAuth(request);
    const params = IdParamsSchema.safeParse(request.params);
    const edit = RecipeEditSchema.safeParse(request.body);
    if (!params.success || !edit.success) throw new HttpStatusError(400, "invalid recipe edit");
    return { data: await options.recipeService.edit(principal.user.id, params.data.id, edit.data) };
  });
  app.post(`${API_PREFIX}/recipes/:id/revisions/:revisionId/restore-item`, { preHandler }, async (request) => {
    const principal = requireAuth(request);
    const params = RestoreParamsSchema.safeParse(request.params);
    const body = RestoreBodySchema.safeParse(request.body);
    if (!params.success || !body.success) throw new HttpStatusError(400, "invalid recipe restore");
    return { data: await options.recipeService.restoreItem(principal.user.id, params.data.id, params.data.revisionId, body.data.itemId) };
  });
}
