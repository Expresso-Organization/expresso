// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PropertySelect } from "./PropertySelect";

describe("PropertySelect", () => {
  afterEach(cleanup);

  it("opens a custom listbox and selects with the keyboard", () => {
    const onChange = vi.fn();
    render(<PropertySelect label="대상 카테고리" value="experience" placeholder="선택하세요" options={[{ value: "experience", label: "경험" }, { value: "project", label: "프로젝트" }]} onChange={onChange} />);
    const trigger = screen.getByRole("button", { name: "대상 카테고리" });

    expect(screen.queryByRole("listbox")).toBeNull();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(screen.getByRole("listbox", { name: "대상 카테고리 선택" })).toBeTruthy();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    fireEvent.keyDown(trigger, { key: "Enter" });

    expect(onChange).toHaveBeenCalledWith("project");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("closes with Escape and keeps the current selection", () => {
    const onChange = vi.fn();
    render(<PropertySelect label="연결 방식" value="multiple" placeholder="선택하세요" options={[{ value: "multiple", label: "여러 기록" }, { value: "single", label: "한 기록" }]} onChange={onChange} />);
    const trigger = screen.getByRole("button", { name: "연결 방식" });

    fireEvent.click(trigger);
    expect(screen.getByRole("option", { name: "여러 기록" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(trigger, { key: "Escape" });

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});
