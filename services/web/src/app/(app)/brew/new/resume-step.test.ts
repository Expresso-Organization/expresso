import { describe, expect, it } from "vitest";

import { resumeStep } from "./resume-step";

/**
 * 진행 중 제작의 status가 위저드 어느 단계로 이어지는지.
 *
 * 홈 읽기 모델(`HomeReadModel.activeBrews`)은 status를 느슨한 문자열로 주므로
 * 모르는 값이 와도 안전한 자리(재료 고르기)로 떨어져야 한다.
 */
describe("resumeStep", () => {
  it("draft는 재료 고르기로 돌아간다", () => {
    expect(resumeStep("draft").segment).toBe("materials");
  });

  it("interviewing은 AI 대화로 돌아간다", () => {
    expect(resumeStep("interviewing").segment).toBe("counter");
  });

  it("recipe는 레시피로 돌아간다", () => {
    expect(resumeStep("recipe").segment).toBe("outline");
  });

  it("generating은 디자인 선택으로 돌아간다 — 추출 대기를 그 화면이 그린다", () => {
    expect(resumeStep("generating").segment).toBe("design");
  });

  it("모르는 status는 재료 고르기로 떨어진다", () => {
    expect(resumeStep("something-new").segment).toBe("materials");
  });

  it("단계 라벨은 위저드 정의와 같은 출처를 쓴다", () => {
    expect(resumeStep("interviewing").label).toBe("AI 대화");
  });
});
