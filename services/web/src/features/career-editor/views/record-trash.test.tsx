// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RecordTrashConfirm, loadDeleteImpacts } from "./record-trash";

const ids = ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002"];
function impact(recordId: string, portfolioCount: number) {
  return new Response(JSON.stringify({ data: { recordId, portfolioCount, blockCount: portfolioCount, deletedAt: "2026-11-10T00:00:00.000Z", purgeAfter: "2026-12-10T00:00:00.000Z" } }), { status: 200 });
}

describe("loadDeleteImpacts", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("counts records that portfolios use and sums their portfolios", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => impact(url.split("/").at(-2)!, url.includes(ids[0]!) ? 2 : 0)));
    await expect(loadDeleteImpacts(ids)).resolves.toEqual({ usedRecordCount: 1, portfolioCount: 2 });
  });

  it("gives up when any record's impact cannot be read", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => url.includes(ids[1]!) ? new Response(null, { status: 404 }) : impact(ids[0]!, 0)));
    await expect(loadDeleteImpacts(ids)).resolves.toBeNull();
  });

  it("rejects a response that breaks the contract", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: { portfolioCount: 1 } }), { status: 200 })));
    await expect(loadDeleteImpacts([ids[0]!])).resolves.toBeNull();
  });
});

describe("RecordTrashConfirm", () => {
  afterEach(cleanup);

  it("names the selection and how many of them portfolios use", () => {
    const onConfirm = vi.fn();
    render(<RecordTrashConfirm open title="" count={3} impact={{ usedRecordCount: 2, portfolioCount: 5 }} onConfirm={onConfirm} onCancel={() => undefined} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("기록 3개를 휴지통으로 옮길까요?");
    expect(dialog.textContent).toContain("선택한 기록 중 2개를 포트폴리오가 근거로 씁니다.");
    fireEvent.click(screen.getByRole("button", { name: /휴지통으로 옮기기/ }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("only mentions the retention period when no portfolio uses the record", () => {
    render(<RecordTrashConfirm open title="결제 장애 회고" count={1} impact={{ usedRecordCount: 0, portfolioCount: 0 }} onConfirm={() => undefined} onCancel={() => undefined} />);
    const dialog = screen.getByRole("dialog");
    expect(screen.getByRole("heading", { name: /이 기록을 휴지통으로 옮길까요\?/ })).toBeTruthy();
    expect(dialog.textContent).toContain("결제 장애 회고");
    expect(dialog.textContent).not.toContain("포트폴리오");
    expect(dialog.textContent).toContain("휴지통에서 30일 동안 복원할 수 있습니다.");
  });
});
