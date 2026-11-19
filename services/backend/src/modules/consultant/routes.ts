import { API_PREFIX, CommitmentCheckinAnswerSchema, CommitmentCheckinResultSchema, ConsultantCheckinsResponseSchema, ConsultantCommitmentResponseSchema, ConsultantMemoryResponseSchema, ConsultantOutreachResponseSchema, SetConsultantOutreachSchema, SetConsultantStageSchema, UpdateCommitmentSchema, UuidSchema, type ConsultantCommitment, type ConversationDigest } from "@expresso/contracts";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { z } from "zod";

import { HttpStatusError, requireAuth } from "../../api/plugins/auth-context.js";
import type { ConsultantApi, ConsultantCommitmentApi } from "./index.js";

const IdParams = z.strictObject({ id: UuidSchema });

/**
 * 컨설턴트의 기억과 연락 — 「내 진행」 화면, 홈의 확인 카드, 대화의 약속 카드가 읽고 고친다.
 *
 * 지난 대화의 요지와 「했어요」로 여는 대화는 대화를 가진 모듈의 일이고, 능동 제안의 켜기 · 끄기는 제안 모듈의 일이다.
 * 여기서는 배선에서 넘겨받은 함수로 부르기만 한다.
 */
export function registerConsultantRoutes(app: FastifyInstance, options: {
  service: Pick<ConsultantApi, "profile" | "setStage" | "removePreference" | "setOutreach">;
  commitments: Pick<ConsultantCommitmentApi, "open" | "get" | "update" | "answer" | "checkins" | "dismissQuiet">;
  digests(userId: string): Promise<ConversationDigest[]>;
  /** 「했어요」라고 답한 약속의 대화를 연다. 채팅을 쓸 수 없으면 null. */
  startCheckinChat(userId: string, commitment: ConsultantCommitment): Promise<string | null>;
  /** 능동 제안. 먼저 연락하기와 함께 켜고 끈다. 켜지 못하면(동의 없음) 던진다. */
  proposals?: { enable(userId: string): Promise<unknown>; disable(userId: string): Promise<unknown> } | undefined;
  authenticateRequest: preHandlerHookHandler;
}) {
  const guard = { preHandler: options.authenticateRequest };
  const id = (params: unknown) => { const parsed = IdParams.safeParse(params); if (!parsed.success) throw new HttpStatusError(400, "invalid id"); return parsed.data.id; };
  const memory = async (userId: string) => ConsultantMemoryResponseSchema.parse({ data: { ...(await options.service.profile(userId)), commitments: await options.commitments.open(userId), recentConversations: await options.digests(userId) } });
  app.get(`${API_PREFIX}/consultant/memory`, guard, async (request) => memory(requireAuth(request).user.id));
  app.put(`${API_PREFIX}/consultant/stage`, guard, async (request) => {
    const input = SetConsultantStageSchema.safeParse(request.body);
    if (!input.success) throw new HttpStatusError(400, "invalid stage");
    const userId = requireAuth(request).user.id;
    await options.service.setStage(userId, input.data.stage, "user");
    return memory(userId);
  });
  app.delete(`${API_PREFIX}/consultant/preferences/:id`, guard, async (request) => {
    const userId = requireAuth(request).user.id;
    await options.service.removePreference(userId, id(request.params));
    return memory(userId);
  });
  /** 먼저 연락하기를 켜고 끈다. 능동 제안도 함께 켜고 끈다 — 사용자가 같은 일을 두 번 정하지 않게. */
  app.put(`${API_PREFIX}/consultant/outreach`, guard, async (request) => {
    const input = SetConsultantOutreachSchema.safeParse(request.body);
    if (!input.success) throw new HttpStatusError(400, "invalid outreach");
    const userId = requireAuth(request).user.id;
    await options.service.setOutreach(userId, input.data.enabled);
    let proposals = false;
    if (options.proposals && input.data.proposals) {
      // 능동 제안은 커리어 기록의 AI 사용 동의가 있어야 켜진다. 없으면 약속 확인만 켜고, 켜지지 않았다는 것을 알린다.
      if (input.data.enabled) proposals = await options.proposals.enable(userId).then(() => true, () => false);
      else await options.proposals.disable(userId).catch(() => undefined);
    }
    return ConsultantOutreachResponseSchema.parse({ data: { enabled: input.data.enabled, proposals } });
  });
  app.get(`${API_PREFIX}/consultant/checkins`, guard, async (request) => ConsultantCheckinsResponseSchema.parse({ data: await options.commitments.checkins(requireAuth(request).user.id) }));
  app.post(`${API_PREFIX}/consultant/quiet/dismiss`, guard, async (request) => {
    const userId = requireAuth(request).user.id;
    await options.commitments.dismissQuiet(userId);
    return ConsultantCheckinsResponseSchema.parse({ data: await options.commitments.checkins(userId) });
  });
  app.get(`${API_PREFIX}/consultant/commitments/:id`, guard, async (request) => ConsultantCommitmentResponseSchema.parse({ data: await options.commitments.get(requireAuth(request).user.id, id(request.params)) }));
  app.patch(`${API_PREFIX}/consultant/commitments/:id`, guard, async (request) => {
    const input = UpdateCommitmentSchema.safeParse(request.body);
    if (!input.success) throw new HttpStatusError(400, "invalid commitment change");
    return ConsultantCommitmentResponseSchema.parse({ data: await options.commitments.update(requireAuth(request).user.id, id(request.params), { dueOn: input.data.dueOn, status: input.data.status }) });
  });
  /** 확인 카드의 답. 「했어요」는 약속을 닫고 그 일을 묻는 대화를 연다. 나머지 답은 모델을 부르지 않는다. */
  app.post(`${API_PREFIX}/consultant/commitments/:id/checkin`, guard, async (request) => {
    const input = CommitmentCheckinAnswerSchema.safeParse(request.body);
    if (!input.success) throw new HttpStatusError(400, "invalid checkin answer");
    const userId = requireAuth(request).user.id;
    const commitment = await options.commitments.answer(userId, id(request.params), input.data);
    const conversationId = input.data.answer === "done" ? await options.startCheckinChat(userId, commitment) : null;
    return CommitmentCheckinResultSchema.parse({ data: { commitment, conversationId } });
  });
}
