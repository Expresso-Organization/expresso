// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AiRecordInterview } from "./AiRecordInterview";

describe("AiRecordInterview", () => {
  afterEach(cleanup);
  it("collects one answer at a time and produces a source-limited AI request", () => {
    const complete = vi.fn();
    render(<AiRecordInterview mode="create" categoryName="프로젝트" onCancel={() => undefined} onComplete={complete} />);
    fireEvent.change(screen.getByRole("textbox", { name: "어떤 경험을 기록할까요?" }), { target: { value: "정산 스케줄러 재설계" } });
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    fireEvent.click(screen.getByRole("button", { name: "기술 리드" }));
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    fireEvent.change(screen.getByRole("textbox", { name: "무엇을 바꾸거나 해결했나요?" }), { target: { value: "재처리 흐름을 큐 구조로 전환" } });
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    fireEvent.change(screen.getByRole("textbox", { name: "어떤 결과가 달라졌나요?" }), { target: { value: "장애 재발 0건" } });
    fireEvent.click(screen.getByRole("button", { name: "AI 제안 준비" }));
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({ title: "정산 스케줄러 재설계", bodyMd: expect.stringContaining("장애 재발 0건"), prompt: expect.stringContaining("추정하지 말고") }));
  });
});
