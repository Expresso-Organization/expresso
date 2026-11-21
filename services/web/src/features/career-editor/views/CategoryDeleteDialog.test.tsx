// @vitest-environment jsdom
import type { CareerCategory, CareerCategoryDeleteImpact } from "@expresso/contracts";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { CategoryDeleteDialog } from "./CategoryDeleteDialog";
import { CategoryMenu } from "./CategoryMenu";

const categoryId = "00000000-0000-4000-8000-000000000001";
const category: CareerCategory = { id: categoryId, key: "custom_abcd1234", name: "사이드 프로젝트", icon: "folder", defaultView: "table", propertySchemaV2: [], schemaVersion: 1, sortOrder: 7, recordCount: 2, version: 1, archivedAt: null, builtIn: false };
const impact = (overrides: Partial<CareerCategoryDeleteImpact> = {}): CareerCategoryDeleteImpact => ({ categoryId, builtIn: false, recordCount: 2, trashedRecordCount: 1, quotedRecordCount: 0, blockingProperties: [], ...overrides });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("CategoryDeleteDialog", () => {
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(() => { router.push.mockReset(); router.refresh.mockReset(); fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("기록 수를 보이고 「기록까지 삭제」로 기록과 함께 지운 뒤 /career로 간다", async () => {
    fetchMock.mockResolvedValueOnce(json({ data: impact() })).mockResolvedValueOnce(new Response(null, { status: 204 }));
    render(<CategoryDeleteDialog open category={category} onClose={() => undefined} />);
    expect(await screen.findByText("3개")).toBeTruthy();
    expect(screen.getByText(/휴지통 1개 포함/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "기록까지 삭제" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/career"));
    expect(String(fetchMock.mock.calls[1]![0])).toBe(`/api/career/categories/${categoryId}?deleteRecords=true`);
    expect(fetchMock.mock.calls[1]![1]?.method).toBe("DELETE");
    expect(router.refresh).toHaveBeenCalled();
  });

  it("「대신 보관」은 지우지 않고 보관한다", async () => {
    fetchMock.mockResolvedValueOnce(json({ data: impact() })).mockResolvedValueOnce(json({ data: { ...category, archivedAt: new Date().toISOString() } }));
    const onClose = vi.fn();
    render(<CategoryDeleteDialog open category={category} onClose={onClose} />);
    fireEvent.click(await screen.findByRole("button", { name: "대신 보관" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(fetchMock.mock.calls[1]![1]).toMatchObject({ method: "PATCH", body: JSON.stringify({ archived: true }) });
    expect(router.push).not.toHaveBeenCalled();
  });

  it("빈 카테고리는 기록 삭제 없이 「삭제」만 묻는다", async () => {
    fetchMock.mockResolvedValueOnce(json({ data: impact({ recordCount: 0, trashedRecordCount: 0 }) })).mockResolvedValueOnce(new Response(null, { status: 204 }));
    render(<CategoryDeleteDialog open category={category} onClose={() => undefined} />);
    fireEvent.click(await screen.findByRole("button", { name: "삭제" }));
    await waitFor(() => expect(router.push).toHaveBeenCalled());
    expect(String(fetchMock.mock.calls[1]![0])).toContain("deleteRecords=false");
    expect(screen.queryByRole("button", { name: "대신 보관" })).toBeNull();
  });

  it("인용 · 관계 속성이 있으면 이유를 보이고 삭제 단추를 두지 않는다", async () => {
    fetchMock.mockResolvedValueOnce(json({ data: impact({ quotedRecordCount: 1, blockingProperties: [{ categoryId: "00000000-0000-4000-8000-000000000002", categoryName: "프로젝트", propertyId: "00000000-0000-4000-8000-000000000003", propertyName: "관련 경력" }] }) }));
    render(<CategoryDeleteDialog open category={category} onClose={() => undefined} />);
    const reasons = await screen.findByRole("list", { name: "삭제를 막는 이유" });
    expect(reasons.textContent).toContain("기록 1개를 인용");
    expect(reasons.textContent).toContain("「프로젝트」 카테고리의 「관련 경력」");
    expect(screen.queryByRole("button", { name: /삭제/ })).toBeNull();
    expect(screen.getByRole("button", { name: "대신 보관" })).toBeTruthy();
  });
});

describe("CategoryMenu", () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("기본 카테고리에는 보관만 있고 삭제가 없다", () => {
    render(<CategoryMenu category={{ ...category, key: "education_history", builtIn: true }} onOpenTrash={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "사이드 프로젝트 메뉴" }));
    expect(screen.getByRole("menuitem", { name: "보관" })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: "카테고리 삭제" })).toBeNull();
  });

  it("보관한 카테고리는 「보관 해제」로 되돌린다", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(json({ data: { ...category, archivedAt: null } }));
    vi.stubGlobal("fetch", fetchMock);
    render(<CategoryMenu category={{ ...category, archivedAt: "2026-11-10T00:00:00.000Z" }} onOpenTrash={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "사이드 프로젝트 메뉴" }));
    expect(screen.getByRole("menuitem", { name: "카테고리 삭제" })).toBeTruthy();
    fireEvent.click(screen.getByRole("menuitem", { name: "보관 해제" }));
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ method: "PATCH", body: JSON.stringify({ archived: false }) });
  });
});
