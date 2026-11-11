// @vitest-environment jsdom
import type { BrewJobStatus } from "@expresso/contracts";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { QuestionBases } from "./counter/QuestionBases";
import { Waiting } from "./Waiting";

const brewId = "3b2f0f8e-1c4d-4a6b-9e7f-0a1b2c3d4e5f";
const jobId = "8f0c4a52-6a43-4b9e-9d2a-1f7a0c2b3e41";

function failed(failure: BrewJobStatus["failure"]): BrewJobStatus {
  return { jobId, type: "interview", status: "failed", stage: "failed", attempts: 1, resultId: null, failure };
}

function show(job: BrewJobStatus) {
  render(
    <Waiting title="질문" note="공고를 읽고 물어볼 것을 고릅니다." job={job} action={async () => {}}
      actionLabel="질문 만들기" rejectedNote="물어볼 자리가 모자랍니다." brewId={brewId} basisJobId={job.jobId} />,
  );
}

afterEach(cleanup);

it("동의가 꺼져 실패하면 그 동의 이름을 말하고 설정의 동의 자리로 보낸다", () => {
  show(failed({ code: "CONSENT_REQUIRED", retryable: false, requiredConsent: "career_records" }));
  expect(screen.getByText(/커리어 기록 사용 동의가 필요해 만들지 못했습니다/)).toBeTruthy();
  expect(screen.getByRole("link", { name: "동의 설정 열기" }).getAttribute("href")).toBe("/account#ai-consent");
  // 동의를 켜고 돌아와 같은 자리에서 다시 누른다.
  expect(screen.getByRole("button", { name: "질문 만들기" })).toBeTruthy();
});

it("동의가 아닌 실패는 지금 문구 그대로이고 설정 링크가 없다", () => {
  show(failed({ code: "PROVIDER_FAILED", retryable: true, requiredConsent: null }));
  expect(screen.getByText("만들지 못했습니다. 다시 시도해 주세요.")).toBeTruthy();
  expect(screen.queryByRole("link")).toBeNull();
  cleanup();
  show(failed({ code: "BREW_INPUT_REJECTED", retryable: false, requiredConsent: null }));
  expect(screen.getByText("물어볼 자리가 모자랍니다.")).toBeTruthy();
});

it("만드는 동안에는 실측에 맞춘 시간을 말하고 화면이 넣은 근거 목록을 카드 아래에 함께 보인다", () => {
  const running: BrewJobStatus = { jobId, type: "interview", status: "running", stage: "drafting", attempts: 1, resultId: null, failure: null };
  render(
    <Waiting title="질문" note="" job={running} action={async () => {}} actionLabel="질문 만들기"
      rejectedNote="" brewId={brewId} basisJobId={jobId}
      detail={<QuestionBases bases={[
        { basis: { type: "requirement", requirementId: jobId, coverage: "missing", evidence: "Kafka 운영 경험" }, label: "Kafka 운영 경험" },
        { basis: { type: "record_gap", recordId: brewId, gap: "metric", evidence: "결제 API 개편" }, label: "결제 API 개편" },
      ]} />} />,
  );
  expect(screen.getByText("보통 15초 안에 끝납니다. 이 화면을 닫아도 계속됩니다.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "질문 만들기" })).toBeNull();
  const bases = screen.getByRole("region", { name: "물어볼 자리" });
  expect(bases.textContent).toContain("물어볼 자리 2곳");
  expect(bases.textContent).toContain("공고 요건 · 아직 못 채움");
  expect(bases.textContent).toContain("Kafka 운영 경험");
  expect(bases.textContent).toContain("기록 · 수치가 빠짐");
  expect(bases.textContent).toContain("결제 API 개편");
});
