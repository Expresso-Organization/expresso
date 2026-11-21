import type { BrewState } from "@expresso/contracts";
import { describe, expect, it } from "vitest";
import { interviewEntry, resumePath } from "./brew-materials-card";

const brewId = "00000000-0000-4000-8000-000000000001";
const jobId = "00000000-0000-4000-8000-000000000009";
/** 이 판정이 읽는 칸만 채운 제작 상태. */
const brew = (extra: Partial<BrewState>): BrewState => ({ brewId, status: "draft", interviewSessionId: null, latestJob: null, ...extra }) as BrewState;
const job = (type: string, status: string) => ({ jobId, type, status }) as NonNullable<BrewState["latestJob"]>;

describe("재료 카드의 다음 길", () => {
  it("재료 단계이고 질문을 만들지 않았으면 고칠 수 있고, 질문 만들기를 맡긴다", () => {
    expect(resumePath(brew({}))).toBeNull();
    expect(interviewEntry(brew({}))).toEqual({ beginsInterview: true, basisJobId: null });
    // 질문 만들기가 실패했으면 다시 고르고 다시 맡길 수 있다.
    expect(resumePath(brew({ latestJob: job("interview", "failed") }))).toBeNull();
    expect(interviewEntry(brew({ latestJob: job("interview", "failed") }))).toEqual({ beginsInterview: true, basisJobId: jobId });
  });

  it("질문을 만드는 중이면 상태가 아직 재료 단계여도 잠그고 대화 화면으로 잇는다", () => {
    for (const status of ["queued", "running"]) {
      expect(resumePath(brew({ latestJob: job("interview", status) }))).toBe(`/brew/${brewId}/counter`);
      expect(interviewEntry(brew({ latestJob: job("interview", status) })).beginsInterview).toBe(false);
    }
  });

  it("재료 단계를 지난 제작은 그 단계의 화면으로 잇는다", () => {
    expect(resumePath(brew({ status: "interviewing", interviewSessionId: jobId }))).toBe(`/brew/${brewId}/counter`);
    // 구성 잡이 도는 동안은 아직 interviewing이어도 디자인 화면으로 잇는다.
    expect(resumePath(brew({ status: "interviewing", interviewSessionId: jobId, latestJob: job("recipe", "running") }))).toBe(`/brew/${brewId}/design`);
    for (const status of ["recipe", "generating", "done"] as const) expect(resumePath(brew({ status }))).toBe(`/brew/${brewId}/design`);
  });
});
