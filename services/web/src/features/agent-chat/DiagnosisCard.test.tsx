// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ConsultantDiagnosis, DiagnosisItem } from "@expresso/contracts";

vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

import { DiagnosisCard, sampleLine } from "./DiagnosisCard";

afterEach(cleanup);

const item = (id: string, label: string, count: number, status: DiagnosisItem["status"], extra: Partial<DiagnosisItem> = {}): DiagnosisItem => ({ id, kind: "technology", label, count, status, evidence: [], note: "", ...extra });
const diagnosis = (overrides: Partial<ConsultantDiagnosis> = {}): ConsultantDiagnosis => ({
  work: "백엔드 개발자", family: "백엔드", basis: "family", focus: null, level: null, sampleSize: 66, companyCount: 15, interestedCount: 0, small: false,
  summary: "Java와 Spring은 기록으로 확인되고 Kafka는 근거가 없습니다.",
  items: [
    item("technology:java", "Java", 45, "confirmed", { evidence: [{ recordId: "00000000-0000-4000-8000-000000000081", quote: "Java로 결제 API를 만들었다", recordTitle: "결제 서버" }] }),
    item("technology:spring", "Spring", 35, "partial", { note: "Spring Boot만 언급됨" }),
    item("technology:kafka", "Kafka", 39, "unconfirmed"),
    item("experience:scale", "대용량 트래픽 · 데이터 처리", 45, "gap", { kind: "experience" }),
  ],
  demandAt: "2026-11-20T00:00:00.000Z", assessedAt: "2026-11-20T00:01:00.000Z", stale: null, ...overrides,
});

describe("목표 진단 카드", () => {
  it("표본을 밝히고, 줄마다 요건의 이름 · 종류 · 표본 가운데 몇 건인지 · 상태를 보인다", () => {
    render(<DiagnosisCard diagnosis={diagnosis()} />);
    expect(screen.getByText("백엔드 공고 66건(회사 15곳)")).toBeTruthy();
    expect(screen.getByText("Java와 Spring은 기록으로 확인되고 Kafka는 근거가 없습니다.")).toBeTruthy();
    const java = screen.getByRole("button", { name: /^Java/ });
    expect(java.textContent).toContain("기술");
    expect(java.textContent).toContain("45/66건");
    expect(java.textContent).toContain("확인됨");
    expect(screen.getByRole("button", { name: /^대용량 트래픽/ }).textContent).toContain("경험");
    expect(screen.getByRole("button", { name: /^Kafka/ }).textContent).toContain("미확인");
    for (const text of ["확인됨 1", "일부 1", "미확인 1", "부족 1"]) expect(screen.getByText(text)).toBeTruthy();
  });
  it("줄을 누르면 근거 기록의 인용과 그 기록으로 가는 링크, 판단의 까닭이 펼쳐진다", () => {
    render(<DiagnosisCard diagnosis={diagnosis()} />);
    fireEvent.click(screen.getByRole("button", { name: /^Java/ }));
    expect(screen.getByRole("link", { name: "결제 서버" }).getAttribute("href")).toBe("/career/records/00000000-0000-4000-8000-000000000081");
    expect(screen.getByText("Java로 결제 API를 만들었다")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Spring/ }));
    expect(screen.getByText("Spring Boot만 언급됨")).toBeTruthy();
    expect(screen.queryByText("Java로 결제 API를 만들었다")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Kafka/ }));
    expect(screen.getByText(/기록에서 근거를 찾지 못했습니다/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^대용량 트래픽/ }));
    expect(screen.getByText("해 본 적이 없다고 답한 항목입니다.")).toBeTruthy();
  });
  it("표본을 어떻게 좁혔는지와 표본이 적다는 것을 밝힌다", () => {
    expect(sampleLine(diagnosis({ focus: "Java", level: "entry", interestedCount: 2, sampleSize: 12, companyCount: 4 }))).toBe("백엔드 공고 12건(회사 4곳) · Java가 나온 공고만 · 신입 · 경력 2년 이하 공고만 · 관심 공고 2건 포함");
    expect(sampleLine(diagnosis({ family: null, basis: "keyword", work: "게임 기획", sampleSize: 3, companyCount: 2 }))).toBe("「게임 기획」로 찾은 공고 3건(회사 2곳)");
    render(<DiagnosisCard diagnosis={diagnosis({ small: true, sampleSize: 3, companyCount: 2 })} />);
    expect(screen.getByRole("note").textContent).toContain("표본이 5건보다 적습니다");
  });
  it("다시 진단이 필요한 까닭을 표시하고, 아직 대조하지 않은 진단은 그렇게 알린다", () => {
    const { rerender } = render(<DiagnosisCard diagnosis={diagnosis({ stale: "goal" })} />);
    expect(screen.getByRole("status").textContent).toBe("목표가 바뀌어 다시 진단해야 합니다");
    rerender(<DiagnosisCard diagnosis={diagnosis({ stale: "records" })} />);
    expect(screen.getByRole("status").textContent).toBe("진단 뒤에 기록이 바뀌었습니다");
    rerender(<DiagnosisCard diagnosis={diagnosis({ assessedAt: null, summary: "" })} />);
    expect(screen.getByText("아직 기록과 대조하지 않았습니다.")).toBeTruthy();
    expect(screen.queryByText("확인됨 1")).toBeNull();
  });
});
