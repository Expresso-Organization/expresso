// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { GapReview } from "@expresso/contracts";
import { GapReviewCard } from "./GapReviewCard";

const item = (id: string, requirement: string, priority: "high" | "low", status: "needs_confirmation" | "needs_improvement") => ({
  id, requirementIndex: 0, requirement, jobQuote: "인용", type: "skill" as const, status, priority, explanation: `${requirement} 설명`, suggestedAction: `${requirement} 다음 행동`,
  evidence: status === "needs_improvement" ? [{ sourceType: "user_message" as const, sourceId: "00000000-0000-4000-8000-000000000009", label: "내 답변", quote: "써 본 적이 없어요" }] : [],
});
const gapReview: GapReview = {
  jobPostingId: "00000000-0000-4000-8000-000000000001", summary: "요약", createdAt: "2026-10-15T00:00:00.000Z",
  items: [item("00000000-0000-4000-8000-000000000002", "MLOps", "low", "needs_confirmation"), item("00000000-0000-4000-8000-000000000003", "Kubernetes", "high", "needs_improvement")],
};
afterEach(cleanup);

describe("보완점 카드", () => {
  it("준비할 순서대로 보이고 펼치면 근거와 다음 행동을 보인다", () => {
    render(<GapReviewCard gapReview={gapReview} />);
    expect(screen.getAllByRole("button").map(button => button.textContent)).toEqual(["Kubernetes기술보완 필요", "MLOps기술확인 필요"]);
    expect(screen.getByText("확인 필요 1")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Kubernetes/ }));
    expect(screen.getByText("써 본 적이 없어요")).toBeTruthy();
    expect(screen.getByText("Kubernetes 다음 행동")).toBeTruthy();
  });
});
