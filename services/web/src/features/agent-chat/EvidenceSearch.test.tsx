// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import EvidenceSearch, { SearchResults } from "./EvidenceSearch";
const mocks = vi.hoisted(() => ({ career: vi.fn(), jobs: vi.fn(), sync: vi.fn() }));
vi.mock("./search-actions", () => ({ searchCareerEvidence: mocks.career, searchSemanticJobs: mocks.jobs, syncEvidenceIndex: mocks.sync }));
vi.mock("@/components/ui/button", () => ({ Button: ({ variant: _variant, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string }) => <button {...props} /> }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it("원문을 HTML로 실행하지 않고 출처와 함께 표시한다", () => {
 render(<SearchResults evidence={{ hits: [{ recordId: "a5100000-0000-4000-8000-000000000001", title: "기록", status: "draft", blockId: null, quote: "<script>bad()</script>", source: "body", fingerprint: "hash", recordVersion: 1, documentVersion: 1, score: 1 }], meta: { mode: "keyword", complete: true, scanned: 1, notices: [] } }} />);
 expect(screen.getByText("<script>bad()</script>")).toBeTruthy(); expect(document.querySelector("script")).toBeNull(); expect(screen.getByRole("link").getAttribute("href")).toContain("/career/records/");
});
it("검색 실패를 사용자에게 알린다", async () => {
 mocks.career.mockResolvedValue({ ok: false, error: "동의를 확인하세요." });
 render(<EvidenceSearch disabled={false} contexts={[]} onAttach={vi.fn()} />);
 fireEvent.change(screen.getByLabelText("검색 요청"), { target: { value: "오류 처리" } });
 fireEvent.click(screen.getByRole("button", { name: "검색" }));
 await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("동의를 확인하세요."));
});
it("동기화 버튼으로 색인을 재확인한다", async () => {
 mocks.sync.mockResolvedValue({ ok: true, data: { indexed: 3, complete: true } });
 render(<EvidenceSearch disabled={false} contexts={[]} onAttach={vi.fn()} />);
 fireEvent.click(screen.getByRole("button", { name: "경력 색인 동기화" }));
 await waitFor(() => expect(screen.getByRole("status").textContent).toContain("기록 3개"));
});
