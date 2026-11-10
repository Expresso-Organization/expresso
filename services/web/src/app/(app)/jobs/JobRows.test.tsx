// @vitest-environment jsdom
import type { JobPostingSummary } from "@expresso/contracts";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { JobRowList, splitStack } from "./JobRows";

afterEach(cleanup);

function job(names: string[]): JobPostingSummary {
  return {
    id: "6f1c2f8e-2d7a-4b8e-9a51-0c3d6e9b7a10",
    title: "광고 서버 엔지니어",
    company: { name: "예시 회사" },
    technologies: names.map((name) => ({ name, matched: null })),
    createdAt: "2026-01-01T00:00:00.000Z",
    daysLeft: null,
    match: null,
    interest: null,
  } as unknown as JobPostingSummary;
}

const names = (list: { name: string }[]) => list.map((tool) => tool.name);
const tools = (list: string[]) => list.map((name) => ({ name }));

describe("splitStack", () => {
  it("짧은 이름 세 개 이하면 모두 그리고 접지 않는다", () => {
    const { shown, hidden } = splitStack(tools(["Go", "Rust", "Kafka"]));
    expect(names(shown)).toEqual(["Go", "Rust", "Kafka"]);
    expect(hidden).toEqual([]);
    expect(splitStack([])).toEqual({ shown: [], hidden: [] });
  });

  it("넷 이상이면 앞의 세 개만 그리고 나머지를 원래 순서대로 접는다", () => {
    const { shown, hidden } = splitStack(tools(["Go", "Rust", "DSP", "SSP", "캐시"]));
    expect(names(shown)).toEqual(["Go", "Rust", "DSP"]);
    expect(names(hidden)).toEqual(["SSP", "캐시"]);
  });

  it("이름이 길어 칩 열을 넘칠 칩은 잘라 그리지 않고 통째로 접는다", () => {
    const { shown, hidden } = splitStack(
      tools(["PyTorch", "Hugging Face", "Scikit-learn", "Pandas"]),
    );
    expect(names(shown)).toEqual(["PyTorch", "Hugging Face"]);
    expect(names(hidden)).toEqual(["Scikit-learn", "Pandas"]);
  });

  it("한글 이름은 영문보다 넓게 센다", () => {
    const { shown } = splitStack(tools(["병원정보시스템(HIS)", "전자의무기록(EMR)", "Java"]));
    expect(names(shown)).toEqual(["병원정보시스템(HIS)"]);
  });

  it("첫 칩은 아무리 길어도 그린다", () => {
    const long = "이벤트 기반 아키텍처 설계와 운영 경험";
    expect(names(splitStack(tools([long, "Go"])).shown)).toEqual([long]);
  });
});

describe("JobRowList 기술 칩", () => {
  it("칩 세 개와 숨긴 개수를 그린다", () => {
    render(<JobRowList jobs={[job(["Go", "Rust", "OpenRTB", "DSP", "SSP"])]} now={0} />);
    expect(screen.getByText("Go")).toBeTruthy();
    expect(screen.getByText("OpenRTB")).toBeTruthy();
    expect(screen.queryByText("DSP")).toBeNull();
    const more = screen.getByText("+2");
    expect(more.getAttribute("title")).toBe("DSP · SSP");
  });

  it("세 개 이하면 숨긴 개수 칩이 없다", () => {
    render(<JobRowList jobs={[job(["Go", "Rust"])]} now={0} />);
    expect(screen.queryByText(/^\+\d+$/)).toBeNull();
  });
});
