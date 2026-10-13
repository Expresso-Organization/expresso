import { describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { createJobCareerMatchInputFingerprint, type JobCareerMatchInput } from "../job-career-match/index.js";
import { CareerGapInputLoader } from "./input-loader.js";
const conversationId = randomUUID(); const userId = randomUUID(); const jobId = randomUUID(); const messageId = randomUUID();
const career = { sessionId: conversationId, job: { id: jobId, title: "개발자", description: "API" }, records: [], inputSnapshot: { jobPostingId: jobId, jobContentHash: "a".repeat(64), records: [], inputTruncated: false } } satisfies JobCareerMatchInput;
function setup() {
  const conversation = { contexts: [{ kind: "job", id: jobId }], run: null, messages: [{ id: messageId, role: "user", text: "API 구현" }] };
  const match = { id: randomUUID(), inputSnapshot: career.inputSnapshot, inputFingerprint: createJobCareerMatchInputFingerprint(career) };
  const agent = { get: vi.fn().mockResolvedValue(conversation) };
  const matches = { getLatest: vi.fn().mockResolvedValue(match) };
  const loader = { load: vi.fn().mockResolvedValue(career) };
  return { instance: new CareerGapInputLoader(agent, matches, loader), agent, matches, conversation, match };
}
describe("Gap input", () => {
  it("uses only selected saved user answers", async () => { const s = setup(); expect((await s.instance.load(userId, conversationId, [])).answers).toEqual([]); expect((await s.instance.load(userId, conversationId, [messageId])).answers).toHaveLength(1); expect(s.agent.get).toHaveBeenCalledWith(userId, conversationId); });
  it("rejects assistant or foreign message IDs", async () => { const s = setup(); await expect(s.instance.load(userId, conversationId, [randomUUID()])).rejects.toMatchObject({ statusCode: 400 }); });
  it("rejects stale P3", async () => { const s = setup(); s.match.inputFingerprint = "b".repeat(64); await expect(s.instance.load(userId, conversationId, [])).rejects.toMatchObject({ statusCode: 409 }); });
  it("rejects no P3", async () => { const s = setup(); s.matches.getLatest.mockResolvedValue(null); await expect(s.instance.load(userId, conversationId, [])).rejects.toMatchObject({ statusCode: 422 }); });
  it("rejects multiple jobs", async () => { const s = setup(); s.conversation.contexts.push({ kind: "job", id: randomUUID() }); await expect(s.instance.load(userId, conversationId, [])).rejects.toMatchObject({ statusCode: 422 }); });
  it("propagates ownership denial", async () => { const s = setup(); s.agent.get.mockRejectedValue(Object.assign(new Error("not found"), { statusCode: 404 })); await expect(s.instance.load(userId, conversationId, [])).rejects.toMatchObject({ statusCode: 404 }); });
});
