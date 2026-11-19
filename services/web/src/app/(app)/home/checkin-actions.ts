"use server";

import { CommitmentCheckinAnswerSchema, UuidSchema, type CommitmentCheckinAnswer, type ConsultantCheckins } from "@expresso/contracts";

import { ApiError } from "@/lib/api/client";
import { consultant } from "@/lib/api/endpoints";
import { requireSession } from "@/lib/require-session";

export type CheckinActionResult = {
  /** 지금의 확인 거리. 실패하면 null이고 화면은 보이던 것을 그대로 둔다. */
  checkins: ConsultantCheckins | null;
  /** 「했어요」로 열린 대화. 열리지 않았으면 null. */
  conversationId: string | null;
  error: string | null;
};

const failed = (error: unknown, fallback: string): CheckinActionResult => ({
  checkins: null, conversationId: null,
  // 409는 받을 수 없는 날짜이거나 이미 닫힌 약속이다. 서버가 쓴 문장을 그대로 보인다.
  error: error instanceof ApiError && error.status === 409 ? error.message : fallback,
});

/** 홈의 확인 카드에서 한 답. 「했어요」는 약속을 닫고 그 일을 묻는 대화를 연다 — AI를 부르는 것은 그때뿐이다. */
export async function answerCheckinAction(commitmentId: string, answer: CommitmentCheckinAnswer): Promise<CheckinActionResult> {
  const session = await requireSession();
  const id = UuidSchema.safeParse(commitmentId); const parsed = CommitmentCheckinAnswerSchema.safeParse(answer);
  if (!id.success || !parsed.success) return { checkins: null, conversationId: null, error: "답을 다시 골라 주세요." };
  try {
    const { data } = await consultant.answerCheckin(session.accessToken, id.data, parsed.data);
    return { checkins: (await consultant.checkins(session.accessToken)).data, conversationId: data.conversationId, error: null };
  } catch (error) {
    if (error instanceof ApiError) return failed(error, "답을 저장하지 못했습니다. 다시 눌러 주세요.");
    throw error;
  }
}

/** 대화가 없어 건넨 연락을 닫는다. */
export async function dismissQuietAction(): Promise<CheckinActionResult> {
  const session = await requireSession();
  try {
    return { checkins: (await consultant.dismissQuiet(session.accessToken)).data, conversationId: null, error: null };
  } catch (error) {
    if (error instanceof ApiError) return failed(error, "닫지 못했습니다. 다시 눌러 주세요.");
    throw error;
  }
}

/**
 * 약속 확인을 받을지 정한다. 능동 제안을 이미 켠 사용자에게만 묻는 카드가 쓴다 — 제안은 건드리지 않는다.
 * 제안을 켜지 않은 사용자는 제안 구획의 「켜기」가 둘을 함께 켠다.
 */
export async function decideOutreachAction(enabled: boolean): Promise<CheckinActionResult> {
  const session = await requireSession();
  try {
    await consultant.setOutreach(session.accessToken, enabled, false);
    return { checkins: (await consultant.checkins(session.accessToken)).data, conversationId: null, error: null };
  } catch (error) {
    if (error instanceof ApiError) return failed(error, "저장하지 못했습니다. 다시 눌러 주세요.");
    throw error;
  }
}
