import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ answer: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/require-session", () => ({ requireSession: async () => ({ accessToken: "server-only" }) }));
vi.mock("@/lib/api/endpoints", () => ({ interview: { answer: mocks.answer }, brews: {} }));
import { ApiError } from "@/lib/api/client";
import { answerQuestionAction } from "./brew-actions";
const id = "00000000-0000-4000-8000-000000000001";
afterEach(() => vi.clearAllMocks());
describe("Interview answer owner outcome", () => {
  it("returns pending to the form without marking the brew complete and retains its request key", async () => {
    const pending = { data: { operationId: id } };
    mocks.answer.mockResolvedValue(pending);
    const form = new FormData();
    for (const [key, value] of Object.entries({ brewId: id, sessionId: id, questionId: id, transcript: "facts", idempotencyKey: "stable-answer-request-key" })) form.set(key, value);
    expect(await answerQuestionAction(form)).toEqual(pending);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(mocks.answer).toHaveBeenCalledWith("server-only", id, id, { inputType: "text", transcript: "facts" }, "stable-answer-request-key");
  });
});
it("returns only safe typed terminal metadata and leaves progress unchanged on actual409",async()=>{
 const terminal={operationId:id,producer:"interview",state:"recovery-required",recordId:id,owners:{business:"completed",document:"pending"},statusUrl:"/v1/career/write-operations/"+id,retryable:false,updatedAt:"2026-10-09T00:00:00Z"};
 mocks.answer.mockRejectedValue(new ApiError({status:409,code:"CONFLICT",message:"Conflict",requestId:id,details:{operation:terminal,command:"private"}}));
 const form=new FormData();for(const[key,value]of Object.entries({brewId:id,sessionId:id,questionId:id,transcript:"facts",idempotencyKey:"stable-answer-request-key"}))form.set(key,value);
 expect(await answerQuestionAction(form)).toEqual({data:terminal});
 expect(mocks.revalidatePath).not.toHaveBeenCalled();
});
