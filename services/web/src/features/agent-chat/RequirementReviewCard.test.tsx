// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RequirementReview } from "@expresso/contracts";
import { RequirementReviewCard } from "./RequirementReviewCard";

const recordId = "00000000-0000-4000-8000-000000000002";
const review: RequirementReview = {
  jobPostingId: "00000000-0000-4000-8000-000000000001", summary: "스트리밍 경험은 확인되고 MLOps는 기록에서 찾지 못했습니다.", createdAt: "2026-10-15T00:00:00.000Z",
  snapshot: { jobContentHash: "a".repeat(64), records: [{ recordId, textHash: "b".repeat(64) }] },
  items: [
    { requirement: "Kafka 스트리밍", jobQuote: "Kafka 기반 실시간 파이프라인", kind: "must", assessment: "strong", explanation: "주문 이벤트 집계 기록이 있습니다.", recommendation: "", evidence: [{ recordId, recordTitle: "주문 이벤트 집계", quote: "Kafka로 주문 이벤트를 집계" }] },
    { requirement: "MLOps 파이프라인", jobQuote: "MLOps 파이프라인 구축", kind: "nice", assessment: "unconfirmed", explanation: "기록에서 찾지 못했습니다.", recommendation: "모델 배포 자동화 경험을 물어봅니다.", evidence: [] },
  ],
};
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("요건 대조 카드", () => {
  it("판정별 개수를 보이고 요건을 펼치면 인용 · 근거 · 보완 제안을 보인다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ data: { stale: false, changed: [] } })));
    render(<RequirementReviewCard conversationId="00000000-0000-4000-8000-000000000003" toolId="00000000-0000-4000-8000-000000000004" review={review} />);
    expect(screen.getByText("강함 1")).toBeTruthy();
    expect(screen.getByText("미확인 1")).toBeTruthy();
    expect(screen.queryByText("Kafka로 주문 이벤트를 집계")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Kafka 스트리밍/ }));
    expect(screen.getByText("Kafka로 주문 이벤트를 집계")).toBeTruthy();
    expect(screen.getByRole("link", { name: /주문 이벤트 집계/ }).getAttribute("href")).toBe(`/career/records/${recordId}`);
    fireEvent.click(screen.getByRole("button", { name: /MLOps/ }));
    expect(screen.getByText("모델 배포 자동화 경험을 물어봅니다.")).toBeTruthy();
    expect(screen.queryByText("다시 대조 필요")).toBeNull();
  });
  it("공고나 근거 기록이 바뀌었으면 다시 대조가 필요하다고 표시한다", async () => {
    const fetcher = vi.fn(async (_url: string) => Response.json({ data: { stale: true, changed: ["records"] } }));
    vi.stubGlobal("fetch", fetcher);
    render(<RequirementReviewCard conversationId="00000000-0000-4000-8000-000000000003" toolId="00000000-0000-4000-8000-000000000004" review={review} />);
    await waitFor(() => expect(screen.getByText("다시 대조 필요")).toBeTruthy());
    expect(fetcher.mock.calls[0]![0]).toBe("/api/agent/conversations/00000000-0000-4000-8000-000000000003/reviews/00000000-0000-4000-8000-000000000004");
  });
});
