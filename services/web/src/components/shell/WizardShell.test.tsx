// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { WIZARD_STEPS, WizardSteps } from "./WizardShell";

const BREW = "6f1d7f0e-3c2a-4b9e-8d11-2a7c5b9e0a01";

afterEach(() => cleanup());

/**
 * 포트폴리오 제작 흐름은 설계서 2.1 이용 절차의 3–8단계 하나뿐이다.
 * 화면 01 · 01b · 02 · 02b · 03 · 04의 순서와 이름이 그대로 단계 줄이 된다.
 */
describe("제작 흐름 단계 줄", () => {
  it("다섯 단계를 순서대로 정의한다 — 레시피는 화면 단계가 아니다", () => {
    expect(WIZARD_STEPS.map(({ label }) => label)).toEqual([
      "공고 분석",
      "재료 고르기",
      "AI 대화",
      "디자인 선택",
      "다듬기",
    ]);
    expect(WIZARD_STEPS.map(({ segment }) => segment)).toEqual([
      "analyze",
      "materials",
      "counter",
      "design",
      "edit",
    ]);
  });

  it("다듬기에서는 앞의 네 단계가 브루 화면으로 돌아가는 링크다", () => {
    render(<WizardSteps brewId={BREW} current="edit" situation="생성 완료" />);
    const links = screen.getAllByRole("link").map((link) => link.getAttribute("href"));
    expect(links).toEqual(
      ["analyze", "materials", "counter", "design"].map((segment) => `/brew/${BREW}/${segment}`),
    );
  });

  it("디자인 선택에서는 지난 세 단계만 링크이고 다음 단계는 막혀 있다", () => {
    render(<WizardSteps brewId={BREW} current="design" situation="38개 디자인" />);
    expect(screen.getAllByRole("link")).toHaveLength(3);
    expect(screen.getByText("다듬기").closest("a")).toBeNull();
  });
});
