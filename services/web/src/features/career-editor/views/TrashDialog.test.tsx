// @vitest-environment jsdom
import type { CareerTrashedRecord } from "@expresso/contracts";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TrashDialog } from "./TrashDialog";

const categoryId = "00000000-0000-4000-8000-000000000001";
const deletedAt = new Date(Date.now() - 60_000).toISOString();
const item: CareerTrashedRecord = { id: "00000000-0000-4000-8000-000000000004", categoryId, title: "지운 기록", status: "draft", origin: "manual", properties: {}, bodyMd: "", version: 2, updatedAt: deletedAt, deletedAt, purgeAfter: new Date(Date.parse(deletedAt) + 30 * 86_400_000).toISOString() };

describe("TrashDialog", () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("lists trashed records with days left and restores one", async () => {
    const fetchMock = vi.fn(async (url: string) => url.endsWith("/trash")
      ? new Response(JSON.stringify({ data: [item] }), { headers: { "content-type": "application/json" } })
      : new Response(JSON.stringify({ data: { ...item, version: 3 } }), { headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const onRestored = vi.fn();
    render(<TrashDialog open categoryId={categoryId} categoryName="경험" onClose={() => undefined} onRestored={onRestored} />);
    expect(await screen.findByText("지운 기록")).toBeTruthy();
    expect(screen.getByText(/30일 뒤 영구 삭제/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /복원/ }));
    await waitFor(() => expect(onRestored).toHaveBeenCalledWith(expect.objectContaining({ id: item.id, version: 3 })));
    expect(fetchMock).toHaveBeenCalledWith(`/api/career/records/${item.id}/restore`, { method: "POST" });
    expect(await screen.findByText("비어 있습니다.")).toBeTruthy();
  });

  it("explains when the retention period has passed", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => url.endsWith("/trash")
      ? new Response(JSON.stringify({ data: [item] }), { headers: { "content-type": "application/json" } })
      : new Response(null, { status: 404 })));
    render(<TrashDialog open categoryId={categoryId} categoryName="경험" onClose={() => undefined} onRestored={() => undefined} />);
    fireEvent.click(await screen.findByRole("button", { name: /복원/ }));
    expect((await screen.findByRole("alert")).textContent).toBe("보관 기간이 지나 복원할 수 없습니다.");
  });
});
