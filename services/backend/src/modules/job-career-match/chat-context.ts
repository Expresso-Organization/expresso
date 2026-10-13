import type { ClientSession, Db } from "mongodb";
import { mongoCollections } from "@expresso/database";

import { JobCareerMatchError } from "./public.js";

export async function resolveMatchChat(
  database: Db,
  userId: string,
  sessionId: string,
  options: { session?: ClientSession } = {},
): Promise<{ jobPostingId: string }> {
  const db = mongoCollections(database);

  // 기존 P2 대화방도 계속 지원합니다.
  const legacySession = await db.jobChatSessions.findOne(
    { _id: sessionId, userId },
    options,
  );

  if (legacySession) {
    return { jobPostingId: legacySession.jobPostingId };
  }

  // 기존 Agent 대화의 연결 자료를 조회합니다.
  const conversation = await db.agentConversations.findOne(
    { _id: sessionId, userId },
    options,
  );

  if (!conversation) {
    throw new JobCareerMatchError(
      404,
      "chat session not found",
    );
  }

  const jobs = conversation.contexts.filter(
    (item) => item.kind === "job",
  );

  if (jobs.length !== 1) {
    throw new JobCareerMatchError(
      422,
      "attach exactly one job before career matching",
    );
  }

  return { jobPostingId: jobs[0]!.id };
}