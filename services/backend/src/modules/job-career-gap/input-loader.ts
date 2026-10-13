import { createHash } from "node:crypto";
import type { JobCareerMatchResult } from "@expresso/contracts";
import type { AgentChatService } from "../agent-chat/index.js";
import { createJobCareerMatchInputFingerprint, type JobCareerMatchApi, type JobCareerMatchInput, type JobCareerMatchInputLoader } from "../job-career-match/index.js";
import { CareerGapError } from "./public.js";
export interface GapInput {
  career: JobCareerMatchInput;
  match: JobCareerMatchResult;
  answers: Array<{ id: string; text: string }>;
  fingerprint: string;
}
export class CareerGapInputLoader {
  constructor(private readonly agent: Pick<AgentChatService, "get">, private readonly matches: Pick<JobCareerMatchApi, "getLatest">, private readonly career: Pick<JobCareerMatchInputLoader, "load">) {}
  async assertOwned(userId: string, conversationId: string) {
    await this.agent.get(userId, conversationId);
  }
  async load(userId: string, conversationId: string, messageIds: string[]): Promise<GapInput> {
    const conversation = await this.agent.get(userId, conversationId);
    const jobs = conversation.contexts.filter((ref) => ref.kind === "job");
    if (jobs.length !== 1) throw new CareerGapError(422, "connect exactly one job");
    if (conversation.run?.status === "running") throw new CareerGapError(409, "chat is running");
    const match = await this.matches.getLatest(userId, conversationId);
    if (!match) throw new CareerGapError(422, "complete P3 analysis first");
    const career = await this.career.load(userId, conversationId);
    if (career.job.id !== jobs[0]!.id || match.inputSnapshot.jobPostingId !== career.job.id || match.inputFingerprint !== createJobCareerMatchInputFingerprint(career)) {
      throw new CareerGapError(409, "P3 inputs changed; analyze P3 again");
    }
    const chosen = new Set(messageIds);
    const answers = conversation.messages.filter((message) => message.role === "user" && chosen.has(message.id)).map(({ id, text }) => ({ id, text }));
    if (answers.length !== messageIds.length || answers.some((answer) => !answer.text.trim() || answer.text.trim() === "내 경력에서 보완할 경험을 질문해줘.")) throw new CareerGapError(400, "select saved user answers");
    if (answers.reduce((sum, answer) => sum + answer.text.length, 0) > 20000) throw new CareerGapError(422, "answers too long");
    const fingerprint = createHash("sha256").update(JSON.stringify({ version: 1, career, matchId: match.id, answers })).digest("hex");
    return { career, match, answers, fingerprint };
  }
}
