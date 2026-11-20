// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentFindItem, AgentFindList } from "@expresso/contracts";

vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

import { ListPart } from "./ListPart";
import { TablePart } from "./TablePart";

afterEach(cleanup);

const job: AgentFindItem = { kind: "job", id: "00000000-0000-4000-8000-000000000091", title: "백엔드 엔지니어", sub: "당근", meta: ["서울", "신입 가능"], daysLeft: 3, href: "/jobs/00000000-0000-4000-8000-000000000091", external: false };
const activity: AgentFindItem = { kind: "activity", id: "wevity:1", title: "데이터 해커톤", sub: "한국데이터산업진흥원", meta: ["해커톤", "데이터"], daysLeft: 20, href: "https://example.com/hackathon", external: true };
const list = (overrides: Partial<AgentFindList> = {}): AgentFindList => ({ title: "백엔드 · 신입 공고", items: [job, activity], total: 9, ...overrides });

describe("찾은 것의 목록", () => {
  it("공고는 앱의 공고 화면으로, 활동은 출처로 새 창에서 연다", () => {
    render(<ListPart list={list()} />);
    const inside = screen.getByRole("link", { name: /백엔드 엔지니어/ });
    expect(inside.getAttribute("href")).toBe("/jobs/00000000-0000-4000-8000-000000000091");
    expect(inside.getAttribute("target")).toBeNull();
    const outside = screen.getByRole("link", { name: /데이터 해커톤/ });
    expect(outside.getAttribute("href")).toBe("https://example.com/hackathon");
    expect(outside.getAttribute("target")).toBe("_blank");
    expect(outside.getAttribute("rel")).toBe("noreferrer");
  });
  it("줄마다 회사 · 조각 · 남은 날을 보이고, 마감이 7일 안이면 임박으로 표시한다. 전체 가운데 몇 건인지 밝힌다", () => {
    render(<ListPart list={list()} />);
    expect(screen.getByRole("region", { name: "백엔드 · 신입 공고" })).toBeTruthy();
    expect(screen.getByText("당근 · 서울 · 신입 가능")).toBeTruthy();
    expect(screen.getByText("D-3").getAttribute("data-urgent")).toBe("true");
    expect(screen.getByText("D-20").getAttribute("data-urgent")).toBeNull();
    expect(screen.getByText("9건 중 2건")).toBeTruthy();
  });
  it("상시 모집은 남은 날을 적지 않고, 찾은 것이 없으면 없다고 알린다", () => {
    const { rerender } = render(<ListPart list={list({ items: [{ ...job, daysLeft: null }], total: 1 })} />);
    expect(screen.queryByText(/^D-/)).toBeNull();
    expect(screen.getByText("1건")).toBeTruthy();
    rerender(<ListPart list={list({ items: [], total: 0 })} />);
    expect(screen.getByText("조건에 맞는 것을 찾지 못했습니다.")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });
});

describe("비교 표", () => {
  it("열 이름과 줄을 그리고, 첫 칸을 줄의 머리로 두며, 컨설턴트가 정리한 내용임을 밝힌다", () => {
    render(<TablePart table={{ title: "두 공고 견주기", columns: ["공고", "경력", "기술"], rows: [["당근 백엔드", "신입 가능", "Kotlin · Kafka"], ["토스 서버", "3년 이상", "Java · Spring"]] }} />);
    expect(screen.getByText("두 공고 견주기")).toBeTruthy();
    expect(screen.getAllByRole("columnheader").map(cell => cell.textContent)).toEqual(["공고", "경력", "기술"]);
    expect(screen.getAllByRole("rowheader").map(cell => cell.textContent)).toEqual(["당근 백엔드", "토스 서버"]);
    expect(screen.getAllByRole("cell").map(cell => cell.textContent)).toEqual(["신입 가능", "Kotlin · Kafka", "3년 이상", "Java · Spring"]);
    expect(screen.getByText(/컨설턴트가 정리한 내용입니다/)).toBeTruthy();
  });
});
