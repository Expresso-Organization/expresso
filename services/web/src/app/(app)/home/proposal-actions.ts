"use server";

import { CONSENT_POLICY_VERSION, type ProposalFeed } from "@expresso/contracts";

import { ApiError } from "@/lib/api/client";
import { consents, proposals } from "@/lib/api/endpoints";
import { requireSession } from "@/lib/require-session";

export type ProposalActionResult = { feed: ProposalFeed | null; error: string | null };

async function act(run: (accessToken: string) => Promise<{ data: ProposalFeed }>, failed: string): Promise<ProposalActionResult> {
  const session = await requireSession();
  try {
    return { feed: (await run(session.accessToken)).data, error: null };
  } catch (error) {
    // 409는 이미 실행 중이거나 꺼져 있을 때다. 지금 상태를 다시 읽어 화면을 맞춘다.
    if (error instanceof ApiError && error.status === 409) return { feed: (await proposals.feed(session.accessToken)).data, error: null };
    return { feed: null, error: failed };
  }
}

/** 지금의 제안과 실행 상태. 실행 중에는 화면이 이것을 되풀이해 읽는다. */
export async function loadProposalsAction(): Promise<ProposalActionResult> {
  return act((accessToken) => proposals.feed(accessToken), "제안을 불러오지 못했습니다.");
}

/**
 * 「켜기」. 안내 창이 커리어 기록을 AI에 넘긴다고 밝혔으므로, 그 동의가 꺼져 있으면 여기서 함께 켠다.
 * 켜면 서버가 첫 실행을 줄에 넣는다.
 */
export async function enableProposalsAction(): Promise<ProposalActionResult> {
  return act(async (accessToken) => {
    const granted = (await consents.list(accessToken)).data.consents.some((consent) => consent.scope === "career_records" && consent.granted);
    if (!granted) await consents.grant(accessToken, ["career_records"], CONSENT_POLICY_VERSION);
    return proposals.enable(accessToken);
  }, "제안을 켜지 못했습니다. 다시 시도해 주세요.");
}

export async function disableProposalsAction(): Promise<ProposalActionResult> {
  return act((accessToken) => proposals.disable(accessToken), "제안을 끄지 못했습니다. 다시 시도해 주세요.");
}

export async function refreshProposalsAction(): Promise<ProposalActionResult> {
  return act((accessToken) => proposals.refresh(accessToken), "제안을 다시 받지 못했습니다. 다시 시도해 주세요.");
}

export async function dismissProposalAction(proposalId: string): Promise<ProposalActionResult> {
  return act((accessToken) => proposals.dismiss(accessToken, proposalId), "제안을 지우지 못했습니다. 다시 시도해 주세요.");
}
