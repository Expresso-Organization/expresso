// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ToolStep } from "./ToolStep";

afterEach(cleanup);

describe("작업 흔적 단계", () => {
  it("실행 중에는 도구 아이콘과 빛 지나감, 끝나면 체크와 결과 요약을 그린다", () => {
    const { container, rerender } = render(<ToolStep status="running" icon="list-bullets" title="기록 목록 확인" summary="기록 목록을 불러오고 있습니다." />);
    expect(screen.getByRole("img", { name: "실행 중" }).querySelector(".ph-list-bullets")).toBeTruthy();
    expect(screen.getByText("기록 목록 확인").className).toContain("ex-anim-shimmer");
    rerender(<ToolStep status="complete" icon="list-bullets" title="기록 목록 확인" summary="기록 3개를 확인했습니다." />);
    expect(screen.getByRole("img", { name: "완료" }).querySelector(".ph-check")).toBeTruthy();
    expect(screen.getByText("기록 목록 확인").className).not.toContain("ex-anim-shimmer");
    expect(screen.getByText("기록 3개를 확인했습니다.")).toBeTruthy();
    expect(container.firstElementChild?.getAttribute("data-status")).toBe("complete");
  });
  it("실패는 x로, 카드는 단계 아래에 붙인다", () => {
    render(<ToolStep status="failed" icon="list-checks" title="요건 대조"><section>대조 카드</section></ToolStep>);
    expect(screen.getByRole("img", { name: "실패" }).querySelector(".ph-x")).toBeTruthy();
    expect(screen.getByText("대조 카드")).toBeTruthy();
  });
});
