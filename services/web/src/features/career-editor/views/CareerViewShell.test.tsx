// @vitest-environment jsdom
import type { CareerCategory, CareerRecord, CareerViewConfiguration } from "@expresso/contracts";
import { CareerViewConfigurationSchema } from "@expresso/contracts";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
const panel: { onRecordChange?: (record: CareerRecord) => void; onCategoryChange?: (category: CareerCategory) => void } = {};
vi.mock("@/app/(app)/career/[categorySlug]/DocumentPanel", () => ({
  DocumentPanel: ({ record, onExpand, onRecordChange, onCategoryChange }: { record: CareerRecord | null; onExpand?: () => void; onRecordChange?: (record: CareerRecord) => void; onCategoryChange?: (category: CareerCategory) => void }) => {
    if (onRecordChange) panel.onRecordChange = onRecordChange;
    if (onCategoryChange) panel.onCategoryChange = onCategoryChange;
    return <aside aria-label="문서 패널 테스트"><span>{record?.title}</span><button onClick={onExpand}>넓게 보기</button></aside>;
  },
}));
import { CareerViewShell, type CareerViewShellProps } from "./CareerViewShell";

const categoryId = "00000000-0000-4000-8000-000000000001", titleId = "00000000-0000-4000-8000-000000000002", dateId = "00000000-0000-4000-8000-000000000003";
const category: CareerCategory = { id: categoryId, key: "test", name: "테스트", icon: "table", defaultView: "table", propertySchemaV2: [{ id: titleId, key: "title", name: "제목", type: "title", required: true, system: true, config: {}, order: 0, version: 1, deletedAt: null }, { id: dateId, key: "date", name: "날짜", type: "date", required: false, system: false, config: {}, order: 1, version: 1, deletedAt: null }], schemaVersion: 1, sortOrder: 0, recordCount: 2, version: 1 };
const records: CareerRecord[] = [1, 2].map((index) => ({ id: `00000000-0000-4000-8000-00000000000${index + 3}`, categoryId, title: `기록 ${index}`, status: index === 1 ? "draft" : "verified", origin: "manual", properties: { date: { type: "date", value: { start: `202${index + 3}-09-0${index}`, end: null, timezone: null } } }, bodyMd: index === 2 ? "결제 장애 회고" : "", version: 1, updatedAt: "2026-09-01T00:00:00.000Z" }));
const viewId = (index: number) => `00000000-0000-4000-8000-0000000001${String(index).padStart(2, "0")}`;
const base: CareerViewConfiguration = { id: viewId(0), categoryId, name: "테이블", type: "table", version: 1, order: 0, filter: null, sorts: [], groupPropertyId: null, groupOrder: [], recordOrder: [], visiblePropertyIds: [titleId, dateId], propertyOrder: [titleId, dateId], columnWidths: {}, gallery: null, board: null, timeline: null, createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z" };
const page = { data: records, page: { hasNextPage: false, nextCursor: null } };

function json(data: unknown, status = 200) { return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } }); }

let created = 0;
function fetchRouter(url: string, init?: RequestInit): Response {
  const method = init?.method ?? "GET";
  const body = init?.body ? JSON.parse(String(init.body)) : {};
  if (url === "/api/career/records" && method === "POST") return json({ data: { ...records[0], id: "00000000-0000-4000-8000-000000000009", title: "" } });
  if (url.endsWith("/restore")) return json({ data: { ...records[0], version: 3 } });
  if (url.startsWith("/api/career/records/") && method === "DELETE") return new Response(null, { status: 204 });
  if (url.startsWith("/api/career/records/")) return json({ data: { ...records.find((record) => url.includes(record.id)) ?? records[0], ...body, version: 2 } });
  if (url.endsWith("/view-configurations/reorder")) return json({ data: body.orderedIds.map((id: string, order: number) => ({ ...base, id, order, version: 2 })) });
  if (url.endsWith("/view-configurations") && method === "POST") { created += 1; return json({ data: { ...base, ...body, id: viewId(50 + created), version: 1, order: created } }); }
  if (url.includes("/duplicate")) return json({ data: { ...base, ...body, id: viewId(90), version: 1 } });
  if (url.includes("/view-configurations/") && method === "DELETE") return new Response(null, { status: 204 });
  if (url.includes("/view-configurations/")) return json({ data: { ...base, ...body, id: url.split("/").at(-1), version: 2 } });
  return json({ data: [] });
}

function renderShell(props: Partial<CareerViewShellProps> = {}) {
  return render(<CareerViewShell category={category} initialViews={[base]} initialPage={page} {...props} />);
}
function calls(match: (url: string, init?: RequestInit) => boolean) {
  return vi.mocked(fetch).mock.calls.filter(([url, init]) => match(String(url), init as RequestInit | undefined));
}

describe("CareerViewShell", () => {
  beforeEach(() => { push.mockReset(); created = 0; vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => fetchRouter(url, init))); window.history.replaceState(null, "", "/career/test"); });
  afterEach(cleanup);

  it("opens the document drawer from the title cell", () => {
    renderShell();
    expect(screen.getByLabelText("문서 패널 테스트").textContent).not.toContain("기록 1");
    fireEvent.click(screen.getByRole("gridcell", { name: "기록 1" }));
    expect(screen.getByLabelText("문서 패널 테스트").textContent).toContain("기록 1");
  });

  it("renders one tab per saved view and switches renderers", async () => {
    const views = (["table", "list", "gallery", "board", "timeline"] as const).map((type, index) => ({ ...base, id: viewId(index), name: `${type} 뷰`, type, order: index, timeline: type === "timeline" ? { startPropertyId: dateId, endPropertyId: null, axisStart: null, axisEnd: null } : null }));
    renderShell({ initialViews: views });
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(views.map((view) => view.name));
    for (const [name, role, label] of [["list 뷰", "list", "커리어 목록"], ["gallery 뷰", "list", "커리어 갤러리"], ["board 뷰", "generic", "커리어 보드"], ["timeline 뷰", "list", "커리어 타임라인"], ["table 뷰", "grid", "커리어 테이블"]] as const) {
      fireEvent.click(screen.getByRole("tab", { name }));
      await waitFor(() => expect(screen.getByRole(role, { name: label })).toBeTruthy());
    }
    expect(window.location.search).toContain(`view=${viewId(0)}`);
    const row = screen.getByRole("row", { name: /기록 1/ });
    fireEvent.keyDown(row, { key: "ArrowDown" });
    expect(screen.getByLabelText("문서 패널 테스트").textContent).toContain("기록 2");
  });

  it("opens the view given in the address", () => {
    renderShell({ initialViews: [base, { ...base, id: viewId(1), name: "보드", type: "board", order: 1, board: { hiddenGroupIds: [], cardOrder: {} } }], initialViewId: viewId(1) });
    expect(screen.getByRole("tab", { name: "보드", selected: true })).toBeTruthy();
    expect(screen.getByLabelText("커리어 보드")).toBeTruthy();
  });

  it("creates records, bulk-updates status, adds a view and opens full page", async () => {
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: "새로 만들기" }));
    await waitFor(() => expect(screen.getAllByLabelText(/선택/).length).toBeGreaterThan(2));
    fireEvent.click(screen.getByLabelText("기록 1 선택"));
    fireEvent.click(screen.getByRole("button", { name: "정리됨" }));
    await waitFor(() => expect(calls((url, init) => url === `/api/career/records/${records[0]!.id}` && init?.method === "PATCH").at(-1)?.[1]?.body).toBe(JSON.stringify({ status: "organized" })));
    fireEvent.click(screen.getByRole("button", { name: "＋ 뷰 추가" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "보드" }));
    await waitFor(() => expect(screen.getByRole("tab", { name: "보드", selected: true })).toBeTruthy());
    const posted = JSON.parse(String(calls((url) => url.endsWith("/view-configurations"))[0]![1]!.body));
    expect(CareerViewConfigurationSchema.omit({ id: true, categoryId: true, version: true, order: true, createdAt: true, updatedAt: true }).parse(posted)).toMatchObject({ name: "보드", type: "board", board: { hiddenGroupIds: [], cardOrder: {} } });
    fireEvent.click(screen.getByRole("button", { name: "넓게 보기" }));
    expect(push).toHaveBeenCalledWith("/career/records/00000000-0000-4000-8000-000000000009");
  });

  it("saves the default tabs in order the first time one changes", async () => {
    renderShell({ category: { ...category, key: "experience" }, initialViews: [] });
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["테이블", "보드", "타임라인"]);
    fireEvent.click(screen.getByRole("button", { name: /^정렬/ }));
    fireEvent.click(screen.getByRole("button", { name: /정렬 추가/ }));
    await waitFor(() => expect(calls((url) => url.endsWith("/view-configurations")).length).toBe(3));
    const bodies = calls((url) => url.endsWith("/view-configurations")).map(([, init]) => JSON.parse(String(init!.body)));
    expect(bodies.map((body) => body.type)).toEqual(["table", "board", "timeline"]);
    expect(bodies[0].sorts).toEqual([{ propertyId: titleId, direction: "asc", nulls: "last" }]);
    expect(bodies[2].timeline).toEqual({ startPropertyId: dateId, endPropertyId: null, axisStart: null, axisEnd: null });
    await waitFor(() => expect(window.location.search).toContain(`view=${viewId(51)}`));
  });

  it("renames, reorders and deletes views from the tab", async () => {
    renderShell({ initialViews: [base, { ...base, id: viewId(1), name: "두 번째", order: 1 }] });
    fireEvent.click(screen.getByRole("tab", { name: "테이블" }));
    const name = screen.getByRole("textbox", { name: "뷰 이름" });
    fireEvent.change(name, { target: { value: "진행 중" } });
    fireEvent.keyDown(name, { key: "Enter" });
    await waitFor(() => expect(JSON.parse(String(calls((url, init) => url.endsWith(viewId(0)) && init?.method === "PATCH")[0]![1]!.body)).name).toBe("진행 중"));
    fireEvent.keyDown(screen.getByRole("tab", { name: "진행 중" }), { key: "ArrowRight", altKey: true });
    await waitFor(() => expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["두 번째", "진행 중"]));
    expect(JSON.parse(String(calls((url) => url.endsWith("/reorder"))[0]![1]!.body))).toEqual({ orderedIds: [viewId(1), viewId(0)] });
    expect((calls((url) => url.endsWith("/reorder"))[0]![1]!.headers as Record<string, string>)["if-match"]).toBe("\"v1\"");
    fireEvent.click(screen.getByRole("tab", { name: "진행 중" }));
    fireEvent.click(screen.getByRole("tab", { name: "진행 중" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "삭제" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "「진행 중」 삭제 확인" }));
    await waitFor(() => expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["두 번째"]));
  });

  it("sends only the latest tab order and uses the bumped category version next time", async () => {
    renderShell({ initialViews: [base, { ...base, id: viewId(1), name: "둘", order: 1 }, { ...base, id: viewId(2), name: "셋", order: 2 }] });
    fireEvent.keyDown(screen.getByRole("tab", { name: "테이블" }), { key: "ArrowRight", altKey: true });
    fireEvent.keyDown(screen.getByRole("tab", { name: "테이블" }), { key: "ArrowRight", altKey: true });
    await waitFor(() => expect(calls((url) => url.endsWith("/reorder")).length).toBe(1));
    fireEvent.keyDown(screen.getByRole("tab", { name: "테이블" }), { key: "ArrowLeft", altKey: true });
    await waitFor(() => expect(calls((url) => url.endsWith("/reorder")).length).toBe(2));
    const sent = calls((url) => url.endsWith("/reorder")).map(([, init]) => [(init!.headers as Record<string, string>)["if-match"], JSON.parse(String(init!.body)).orderedIds]);
    expect(sent).toEqual([["\"v1\"", [viewId(1), viewId(2), viewId(0)]], ["\"v2\"", [viewId(1), viewId(0), viewId(2)]]]);
    expect(screen.getAllByRole("tab").map((item) => item.textContent)).toEqual(["둘", "테이블", "셋"]);
  });

  it("builds an and/or filter tree that the contract accepts", async () => {
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: /^필터/ }));
    fireEvent.click(screen.getByRole("button", { name: /^조건 추가/ }));
    fireEvent.click(screen.getByRole("button", { name: /조건 묶음 추가/ }));
    const value = screen.getAllByRole("textbox", { name: "제목 값" })[0]!;
    fireEvent.change(value, { target: { value: "기록 2" } });
    await waitFor(() => expect(screen.queryByRole("row", { name: /기록 1/ })).toBeNull());
    const saved = JSON.parse(String(calls((url, init) => url.endsWith(viewId(0)) && init?.method === "PATCH").at(-1)![1]!.body));
    expect(CareerViewConfigurationSchema.shape.filter.parse(saved.filter)).toEqual({ operator: "and", filters: [{ propertyId: titleId, operator: "contains", operand: { type: "title", value: "기록 2" } }, { operator: "or", filters: [{ propertyId: titleId, operator: "contains", operand: null }] }] });
  });

  it("keeps filter, sort and property controls in separate popovers", () => {
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: /^필터/ }));
    expect(screen.getByRole("region", { name: "필터 설정" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "정렬 설정" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^정렬/ }));
    expect(screen.queryByRole("region", { name: "필터 설정" })).toBeNull();
    expect(screen.getByRole("region", { name: "정렬 설정" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^속성$/ }));
    expect(screen.getByRole("region", { name: "표시 속성 설정" })).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("region", { name: "표시 속성 설정" })).toBeNull();
  });

  it.each([
    ["experience", ["테이블", "보드", "타임라인"], "대화로 꺼낸 순간들을 문서로 관리합니다."],
    ["project", ["갤러리", "테이블", "타임라인"], "무엇을 만들었고 무엇이 달라졌는지."],
    ["education_history", ["타임라인", "테이블", "갤러리"], "학교와 회사를 시간순으로."],
  ] as const)("keeps the screen-definition default tabs for %s", (key, tabs, blurb) => {
    renderShell({ category: { ...category, key, name: key }, initialViews: [] });
    expect(screen.getAllByRole("tab").map((item) => item.textContent)).toEqual(tabs);
    expect(screen.getByText(new RegExp(blurb))).toBeTruthy();
    for (const action of ["＋ 뷰 추가", "새로 만들기", "AI로 만들기"]) expect(screen.getByRole("button", { name: action })).toBeTruthy();
  });

  it("matches the project gallery information hierarchy", () => {
    renderShell({ category: { ...category, key: "project", name: "프로젝트", defaultView: "gallery" }, initialViews: [{ ...base, type: "gallery", gallery: { coverPropertyId: null, previewPropertyIds: [] } }] });
    expect(screen.getByLabelText("커리어 갤러리")).toBeTruthy();
    expect(screen.getByRole("button", { name: /프로젝트 추가/ })).toBeTruthy();
    expect(screen.getByText("2개 · 성과 수치 없음 2")).toBeTruthy();
  });

  it("filters records immediately and opens the guided AI questions", () => {
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: /검증됨 1/ }));
    expect(screen.getByRole("row", { name: /기록 2/ })).toBeTruthy();
    expect(screen.queryByRole("row", { name: /기록 1/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "AI로 만들기" }));
    expect(screen.getByRole("dialog").textContent).toContain("기록 시작하기");
  });

  it("routes the project missing-outcome action into guided questions", () => {
    renderShell({ category: { ...category, key: "project", name: "프로젝트", defaultView: "gallery" }, initialViews: [{ ...base, type: "gallery", gallery: { coverPropertyId: null, previewPropertyIds: [] } }] });
    fireEvent.click(screen.getByRole("button", { name: "비어 있는 성과 채우기" }));
    expect(screen.getByRole("dialog").textContent).toContain("보완하기");
  });

  it("searches title and body text and keeps the query in the address", () => {
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: "기록 검색" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "기록 검색" }), { target: { value: "장애" } });
    expect(screen.getByRole("row", { name: /기록 2/ })).toBeTruthy();
    expect(screen.queryByRole("row", { name: /기록 1/ })).toBeNull();
    expect(new URL(window.location.href).searchParams.get("q")).toBe("장애");
    fireEvent.change(screen.getByRole("searchbox", { name: "기록 검색" }), { target: { value: "없는 말" } });
    expect(screen.getByText("조건에 맞는 기록이 없습니다.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "검색어 지우기" }));
    expect(screen.getByRole("row", { name: /기록 1/ })).toBeTruthy();
  });

  it("shows the first-record screen for an empty category", async () => {
    renderShell({ initialPage: { data: [], page: { hasNextPage: false, nextCursor: null } } });
    expect(screen.queryByText("조건에 맞는 기록이 없습니다.")).toBeNull();
    expect(screen.getAllByRole("button", { name: "새로 만들기" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "첫 기록 만들기" }));
    await waitFor(() => expect(screen.getByRole("grid", { name: "커리어 테이블" })).toBeTruthy());
  });

  it("moves board cards between status columns, including empty ones", async () => {
    renderShell({ initialViews: [{ ...base, type: "board", board: { hiddenGroupIds: [], cardOrder: {} } }] });
    const board = screen.getByLabelText("커리어 보드");
    expect(within(board).getAllByRole("heading").map((heading) => heading.firstChild?.textContent)).toEqual(["초안", "정리됨", "검증됨"]);
    fireEvent.click(screen.getByRole("button", { name: "기록 1 정리됨(으)로 옮기기" }));
    await waitFor(() => expect(within(screen.getByRole("region", { name: "정리됨" })).getByText("기록 1")).toBeTruthy());
    await waitFor(() => expect(calls((url, init) => url.endsWith(records[0]!.id) && init?.method === "PATCH").at(-1)?.[1]?.body).toBe(JSON.stringify({ status: "organized" })));
  });

  it("places records on a time axis with year ticks", () => {
    renderShell({ initialViews: [{ ...base, type: "timeline", timeline: { startPropertyId: dateId, endPropertyId: null, axisStart: null, axisEnd: null } }], initialPage: { data: [...records, { ...records[0]!, id: "00000000-0000-4000-8000-000000000008", title: "날짜 빈 기록", properties: {} }], page: { hasNextPage: false, nextCursor: null } } });
    const timeline = screen.getByRole("list", { name: "커리어 타임라인" });
    expect([...timeline.querySelectorAll("time strong")].map((item) => item.textContent)).toEqual(["2025.09.02", "2024.09.01"]);
    expect(timeline.textContent).toContain("2025");
    expect(within(screen.getByRole("region", { name: "날짜 없는 기록" })).getByText("날짜 빈 기록")).toBeTruthy();
  });

  it("fills the start date of timeline views saved without one", async () => {
    renderShell({ initialViews: [{ ...base, type: "timeline", timeline: null }] });
    expect([...screen.getByRole("list", { name: "커리어 타임라인" }).querySelectorAll("time strong")].map((item) => item.textContent)).toEqual(["2025.09.02", "2024.09.01"]);
    fireEvent.click(screen.getByRole("button", { name: /^정렬/ }));
    fireEvent.click(screen.getByRole("button", { name: /정렬 추가/ }));
    await waitFor(() => expect(calls((url, init) => url.endsWith(viewId(0)) && init?.method === "PATCH").length).toBe(1));
    expect(JSON.parse(String(calls((url, init) => url.endsWith(viewId(0)) && init?.method === "PATCH")[0]![1]!.body)).timeline).toMatchObject({ startPropertyId: dateId });
  });

  it("moves deleted records to the trash with an undo", async () => {
    renderShell();
    const row = screen.getByRole("row", { name: /기록 1/ });
    fireEvent.contextMenu(within(row).getByRole("gridcell", { name: "기록 1" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /기록 삭제/ }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("휴지통으로 옮겼습니다."));
    expect(screen.queryByRole("row", { name: /기록 1/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "되돌리기" }));
    await waitFor(() => expect(screen.getByRole("row", { name: /기록 1/ })).toBeTruthy());
    expect(calls((url) => url.endsWith(`${records[0]!.id}/restore`)).length).toBe(1);
  });

  it("applies panel edits and new properties to the view without reloading", async () => {
    renderShell();
    act(() => panel.onRecordChange?.({ ...records[0]!, title: "패널에서 고친 제목", version: 2 }));
    expect(screen.getByRole("gridcell", { name: "패널에서 고친 제목" })).toBeTruthy();
    const newId = "00000000-0000-4000-8000-000000000077";
    act(() => panel.onCategoryChange?.({ ...category, version: 2, propertySchemaV2: [...category.propertySchemaV2, { id: newId, key: "role", name: "역할", type: "text", required: false, system: false, config: {}, order: 2, version: 1, deletedAt: null }] }));
    await waitFor(() => expect(screen.getByRole("columnheader", { name: /역할/ })).toBeTruthy());
    const saved = JSON.parse(String(calls((url, init) => url.endsWith(viewId(0)) && init?.method === "PATCH").at(-1)![1]!.body));
    expect(saved.visiblePropertyIds).toEqual([titleId, dateId, newId]);
  });

  it("optimistically saves table cells in the background", async () => {
    renderShell();
    const title = screen.getByRole("gridcell", { name: "기록 1" });
    fireEvent.focus(title);
    fireEvent.keyDown(title, { key: "F2" });
    const input = screen.getByRole("textbox", { name: "제목 셀 편집" });
    fireEvent.change(input, { target: { value: "수정된 기록" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(expect.stringContaining(`/api/career/records/${records[0]!.id}`), expect.objectContaining({ method: "PATCH", body: JSON.stringify({ title: "수정된 기록" }) })));
    expect(screen.queryByText("저장 중...")).toBeNull();
    await waitFor(() => expect(screen.getByText("수정된 기록").closest('[role="gridcell"]')).toBeTruthy());
  });

  it("rolls back only the failed cell and marks it for retry", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => init?.method === "PATCH" ? new Response(null, { status: 500 }) : json({ data: records[0] })));
    renderShell();
    const title = screen.getByRole("gridcell", { name: "기록 1" });
    fireEvent.focus(title);
    fireEvent.keyDown(title, { key: "F2" });
    const input = screen.getByRole("textbox", { name: "제목 셀 편집" });
    fireEvent.change(input, { target: { value: "실패할 제목" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect((screen.getByText("기록 1").closest('[role="gridcell"]') as HTMLElement | null)?.dataset.issue).toBe("true"));
    expect(screen.getByRole("gridcell", { name: "기록 2" })).toBeTruthy();
  });
});
