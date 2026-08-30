import {
  API_PREFIX,
  PortfolioEditCommandSchema,
  ReorderBlocksSchema,
  ReorderPortfolioSectionsSchema,
  RestorePortfolioSchema,
  UpdatePortfolioSectionSchema,
} from "@expresso/contracts";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { z } from "zod";
import { HttpStatusError, requireAuth } from "../../api/plugins/auth-context.js";
import { type PortfolioEditingApi } from "./index.js";

const PortfolioBlockParams = z.strictObject({ id: z.uuid(), blockId: z.uuid() });
const ProposalParams = z.strictObject({ id: z.uuid() });
const RevisionParams = z.strictObject({ id: z.uuid() });
const SectionParams = z.strictObject({ id: z.uuid(), sectionId: z.uuid() });
const RevertBody = z.strictObject({ confirmConflict: z.boolean().default(false) });

export function registerPortfolioEditingRoutes(app: FastifyInstance, options: { service: PortfolioEditingApi; authenticateRequest: preHandlerHookHandler }) {
  app.post(`${API_PREFIX}/portfolios/:id/blocks/:blockId/edit-preview`, { preHandler: options.authenticateRequest }, async (request, reply) => {
    const user = requireAuth(request).user;
    const params = PortfolioBlockParams.safeParse(request.params);
    const command = PortfolioEditCommandSchema.safeParse(request.body);
    if (!params.success || !command.success) throw new HttpStatusError(400, "invalid portfolio edit preview");
    return reply.code(201).send({ data: await options.service.preview(user.id, params.data.id, params.data.blockId, command.data) });
  });
  /** 04 캔버스 툴바 — 한 섹션 안의 블록 차례. */
  app.patch(`${API_PREFIX}/portfolios/:id/sections/:sectionId/blocks/order`, { preHandler: options.authenticateRequest }, async (request) => {
    const user = requireAuth(request).user;
    const params = SectionParams.safeParse(request.params);
    const body = ReorderBlocksSchema.safeParse(request.body);
    if (!params.success || !body.success) throw new HttpStatusError(400, "invalid block order");
    return {
      data: await options.service.reorderBlocks(
        user.id, params.data.id, params.data.sectionId, body.data.blockIds,
      ),
    };
  });

  /** 블록 하나 더 만들기. 사람이 만든 자리라 잠근 채로 붙는다. */
  app.post(`${API_PREFIX}/portfolios/:id/blocks/:blockId/duplicate`, { preHandler: options.authenticateRequest }, async (request, reply) => {
    const user = requireAuth(request).user;
    const params = PortfolioBlockParams.safeParse(request.params);
    if (!params.success) throw new HttpStatusError(400, "invalid block");
    return reply.code(201).send({
      data: await options.service.duplicateBlock(user.id, params.data.id, params.data.blockId),
    });
  });

  /** 블록 지우기. 지우기 전에 복원 지점을 하나 뜬다. */
  app.delete(`${API_PREFIX}/portfolios/:id/blocks/:blockId`, { preHandler: options.authenticateRequest }, async (request) => {
    const user = requireAuth(request).user;
    const params = PortfolioBlockParams.safeParse(request.params);
    if (!params.success) throw new HttpStatusError(400, "invalid block");
    return { data: await options.service.deleteBlock(user.id, params.data.id, params.data.blockId) };
  });

  /** 04 섹션 순서. 지면 전체의 차례를 통째로 받는다. */
  app.patch(`${API_PREFIX}/portfolios/:id/sections/order`, { preHandler: options.authenticateRequest }, async (request) => {
    const user = requireAuth(request).user;
    const params = ProposalParams.safeParse(request.params);
    const body = ReorderPortfolioSectionsSchema.safeParse(request.body);
    if (!params.success || !body.success) throw new HttpStatusError(400, "invalid section order");
    return { data: await options.service.reorderSections(user.id, params.data.id, body.data.sectionIds) };
  });

  /** 04 섹션 숨김. 지우지 않고 배포에서만 뺀다. */
  app.patch(`${API_PREFIX}/portfolios/:id/sections/:sectionId`, { preHandler: options.authenticateRequest }, async (request) => {
    const user = requireAuth(request).user;
    const params = SectionParams.safeParse(request.params);
    const body = UpdatePortfolioSectionSchema.safeParse(request.body);
    if (!params.success || !body.success) throw new HttpStatusError(400, "invalid section change");
    return {
      data: await options.service.setSectionVisibility(
        user.id, params.data.id, params.data.sectionId, body.data.visible,
      ),
    };
  });

  app.post(`${API_PREFIX}/portfolio-edit-proposals/:id/apply`, { preHandler: options.authenticateRequest }, async (request) => {
    const user = requireAuth(request).user; const params = ProposalParams.safeParse(request.params);
    if (!params.success) throw new HttpStatusError(400, "invalid edit proposal ID");
    return { data: await options.service.apply(user.id, params.data.id) };
  });
  app.post(`${API_PREFIX}/portfolio-revisions/:id/revert`, { preHandler: options.authenticateRequest }, async (request) => {
    const user = requireAuth(request).user; const params = RevisionParams.safeParse(request.params); const body = RevertBody.safeParse(request.body ?? {});
    if (!params.success || !body.success) throw new HttpStatusError(400, "invalid portfolio revert");
    return { data: await options.service.revertRevision(user.id, params.data.id, body.data.confirmConflict) };
  });
  app.post(`${API_PREFIX}/portfolios/:id/restore`, { preHandler: options.authenticateRequest }, async (request) => {
    const user = requireAuth(request).user; const params = ProposalParams.safeParse(request.params); const body = RestorePortfolioSchema.safeParse(request.body);
    if (!params.success || !body.success) throw new HttpStatusError(400, "invalid portfolio restore");
    return { data: await options.service.restore(user.id, params.data.id, body.data.snapshotId) };
  });
}
