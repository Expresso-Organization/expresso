import { expect, it, vi } from "vitest";
import { AgentChatService } from "./service.js";
import type { AgentConversationDoc } from "@expresso/database";
import { ConsentError } from "../consent/index.js";

function fixture(allowJobs: boolean) {
  const requireConsent = vi.fn(async (_user: string, contract: string) => {
    if (contract === "job_analysis" && !allowJobs) throw new ConsentError("job_posting_analysis");
  });
  const service = new AgentChatService({} as never, { run: vi.fn() }, {} as never, {} as never, {} as never, { require: requireConsent } as never);
  const subject = service as unknown as { prepare(userId: string, row: AgentConversationDoc): Promise<unknown>; context: ReturnType<typeof vi.fn> };
  subject.context = vi.fn(async () => []);
  const row = { contexts: [{ kind: "job", id: "job" }], run: null } as unknown as AgentConversationDoc;
  return { subject, row, requireConsent };
}
it("공고 분석 동의가 없으면 자료 조회·실행 준비 전에 필요한 동의를 안내한다", async () => {
  const f = fixture(false);
  await expect(f.subject.prepare("owner", f.row)).rejects.toMatchObject({ statusCode: 403, publicDetails: { requiredConsent: "job_posting_analysis" } });
  expect(f.subject.context).not.toHaveBeenCalled();
});
it("공고 분석 동의가 있으면 정상 경로를 유지한다", async () => {
  const f = fixture(true);
  await expect(f.subject.prepare("owner", f.row)).resolves.toEqual([]);
  expect(f.requireConsent).toHaveBeenCalledWith("owner", "partial_edit");
  expect(f.requireConsent).toHaveBeenCalledWith("owner", "job_analysis");
  expect(f.subject.context).toHaveBeenCalledOnce();
});
it("공고가 없는 대화에는 공고 분석 동의를 요구하지 않는다", async () => {
  const f = fixture(false); f.row.contexts = [];
  await expect(f.subject.prepare("owner", f.row)).resolves.toEqual([]);
  expect(f.requireConsent).not.toHaveBeenCalledWith("owner", "job_analysis");
});
