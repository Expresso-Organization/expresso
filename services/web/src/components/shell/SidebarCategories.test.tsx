// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/career/project", useRouter: () => router }));

import type { CareerCategory } from "@expresso/contracts";

import { SidebarCategories } from "./SidebarCategories";

const categoryOf = (key: string, name: string, archivedAt: string | null, index: number): CareerCategory => ({ id: `00000000-0000-4000-8000-00000000000${index}`, key, name, icon: "folder", defaultView: "table", propertySchemaV2: [], sortOrder: index, recordCount: 0, version: 1, archivedAt, builtIn: true });

const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => { router.push.mockReset(); router.refresh.mockReset(); fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("이름을 넣고 Enter를 누르면 카테고리를 만들고 그 화면으로 간다", async () => {
  fetchMock.mockResolvedValueOnce(new Response("{}", { status: 201 }));
  render(<SidebarCategories categories={[]} />);
  fireEvent.click(screen.getByTitle("카테고리 추가"));
  const input = screen.getByRole("textbox", { name: "새 카테고리 이름" });
  fireEvent.change(input, { target: { value: "  사이드 프로젝트 " } });
  fireEvent.submit(input);
  await waitFor(() => expect(router.push).toHaveBeenCalledTimes(1));
  const body = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body)) as Record<string, string>;
  expect(body).toMatchObject({ name: "사이드 프로젝트", icon: "folder", defaultView: "table" });
  expect(body.key).toMatch(/^custom_[0-9a-f]{8}$/);
  expect(router.push).toHaveBeenCalledWith(`/career/${body.key}`);
  expect(router.refresh).toHaveBeenCalled();
  expect(screen.getByTitle("카테고리 추가")).toBeTruthy();
});

it("Escape는 입력을 닫고 아무것도 만들지 않는다", () => {
  render(<SidebarCategories categories={[]} />);
  fireEvent.click(screen.getByTitle("카테고리 추가"));
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "활동" } });
  fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" });
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(fetchMock).not.toHaveBeenCalled();
});

it("만들지 못하면 입력을 남기고 오류로 표시한다", async () => {
  fetchMock.mockResolvedValueOnce(new Response(null, { status: 409 }));
  render(<SidebarCategories categories={[]} />);
  fireEvent.click(screen.getByTitle("카테고리 추가"));
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "활동" } });
  fireEvent.submit(screen.getByRole("textbox"));
  await waitFor(() => expect(screen.getByRole("textbox").getAttribute("aria-invalid")).toBe("true"));
  expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("활동");
  expect(router.push).not.toHaveBeenCalled();
});

it("머리말 +도 같은 입력을 연다", () => {
  render(<SidebarCategories categories={[]} />);
  const [headerAdd] = screen.getAllByRole("button", { name: "카테고리 추가" });
  fireEvent.click(headerAdd!);
  expect(screen.getByRole("textbox", { name: "새 카테고리 이름" })).toBeTruthy();
  expect(headerAdd!.getAttribute("aria-expanded")).toBe("true");
});

it("보관한 카테고리는 「보관됨」을 펼쳐야 보인다", () => {
  render(<SidebarCategories categories={[categoryOf("experience", "경력", null, 1), categoryOf("education_history", "학력", "2026-11-10T00:00:00.000Z", 2)]} />);
  expect(screen.getByRole("link", { name: /경력/ })).toBeTruthy();
  expect(screen.queryByRole("link", { name: /학력/ })).toBeNull();
  const toggle = screen.getByRole("button", { name: /보관됨/ });
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  fireEvent.click(toggle);
  expect(screen.getByRole("link", { name: /학력/ })).toBeTruthy();
});

it("보관한 카테고리를 보고 있으면 「보관됨」이 처음부터 펼쳐진다", () => {
  render(<SidebarCategories categories={[categoryOf("experience", "경력", null, 1), categoryOf("project", "프로젝트", "2026-11-10T00:00:00.000Z", 2)]} />);
  expect(screen.getByRole("button", { name: /보관됨/ }).getAttribute("aria-expanded")).toBe("true");
  expect(screen.getByRole("link", { name: /프로젝트/ }).getAttribute("aria-current")).toBe("page");
});

it("보관한 카테고리가 없으면 「보관됨」 줄도 없다", () => {
  render(<SidebarCategories categories={[categoryOf("experience", "경력", null, 1)]} />);
  expect(screen.queryByRole("button", { name: /보관됨/ })).toBeNull();
});
