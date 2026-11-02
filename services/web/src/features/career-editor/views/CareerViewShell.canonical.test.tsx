// @vitest-environment jsdom
import type { CareerBusinessPropertyValue, CareerCategory, CareerRecord, CareerViewConfiguration } from "@expresso/contracts";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/app/(app)/career/[categorySlug]/DocumentPanel", () => ({ DocumentPanel: () => null }));
import { CareerViewShell } from "./CareerViewShell";
import { rawValue } from "./view-types";

const id = "00000000-0000-4000-8000-000000000001";
const scoreId = "00000000-0000-4000-8000-000000000002";
const dateId = "00000000-0000-4000-8000-000000000003";
const noteId = "00000000-0000-4000-8000-000000000004";
const category: CareerCategory = { id, key: "test", name: "테스트", icon: "table", defaultView: "table", propertySchemaV2: [
  { id: scoreId, key: "score", name: "점수", type: "number", required: false, system: false, config: {}, order: 0, version: 1, deletedAt: null },
  { id: dateId, key: "period", name: "기간", type: "date", required: false, system: false, config: {}, order: 1, version: 1, deletedAt: null },
  { id: noteId, key: "note", name: "메모", type: "text", required: false, system: false, config: {}, order: 2, version: 1, deletedAt: null },
], sortOrder: 0, recordCount: 1, version: 1 };
const values: CareerBusinessPropertyValue[] = [{ propertyDefinitionId: scoreId, type: "number", value: "123.4500" }, { propertyDefinitionId: dateId, type: "date", value: { precision: "datetime", start: "2026-09-01T12:30:00.123456789+09:00", end: null, timezone: "Asia/Seoul" } }, { propertyDefinitionId: noteId, type: "text", value: "원본 메모" }];
const record: CareerRecord = { id, categoryId: id, title: "원본 기록", status: "draft", origin: "manual", properties: { score: { type: "number", value: 3 }, period: { type: "date", value: { start: "2025-01-01", end: null, timezone: null } }, note: { type: "text", value: "legacy" } }, propertyValues: values, bodyMd: "본문", version: 1, updatedAt: "2026-09-01T00:00:00Z" };
const view: CareerViewConfiguration = { id: "local-" + id, categoryId: id, name: "기본", type: "table", version: 1, order: 0, filter: null, sorts: [], groupPropertyId: null, groupOrder: [], recordOrder: [], visiblePropertyIds: [scoreId, dateId, noteId], propertyOrder: [scoreId, dateId, noteId], columnWidths: {}, gallery: null, board: null, timeline: null, createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-01T00:00:00Z" };
function setup(records = [record], configuration = view, conflict = false, selectedCategory = category, onEnsureOption?: (definition: NonNullable<CareerCategory["propertySchemaV2"]>[number], label: string) => Promise<{ id: string; name: string }>) {
  const requests: Array<{ method: string | undefined; body: Record<string, unknown> }> = [];
  let first = true;
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (init?.method === "PATCH" || init?.method === "POST") requests.push({ method: init.method, body });
    if (init?.method === "PATCH" && conflict && first) { first = false; return new Response(null, { status: 412 }); }
    return new Response(JSON.stringify({ data: { ...record, id: init?.method === "POST" ? id.slice(0, -1) + "9" : record.id, version: conflict ? 5 : 2 } }), { status: 200, headers: { "content-type": "application/json" } });
  }));
  render(<CareerViewShell {...(onEnsureOption ? { onEnsureOption } : {})} category={selectedCategory} initialView={configuration} initialPage={{ data: records, page: { hasNextPage: false, nextCursor: null } }} />);
  return requests;
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); sessionStorage.clear(); });

describe("canonical Career views", () => {
  it("reads a present canonical array by definition ID instead of legacy keys", () => {
    expect(rawValue(record, "score", category)).toBe("123.4500");
    expect(rawValue({ ...record, propertyValues: [] }, "score", category)).toBeUndefined();
    expect(rawValue({ ...record, propertyValues: undefined }, "score", category)).toBe(3);
  });
  it.each(["table", "list", "gallery"] as const)("renders exact canonical values in %s", (type) => {
    setup([record], { ...view, type });
    expect(screen.getByText("123.4500")).toBeTruthy();
    expect(screen.getByText("원본 메모")).toBeTruthy();
    expect(screen.queryByText("legacy")).toBeNull();
  });
  it("sorts decimals numerically without collapsing large integers", () => {
    const records = ["9007199254740993123456789012345679", "9007199254740993123456789012345678", "10.0000", "2"].map((value, index) => ({ ...record, id: id.slice(0, -1) + (index + 1), title: "숫자 " + value, propertyValues: [{ propertyDefinitionId: scoreId, type: "number" as const, value }] }));
    setup(records, { ...view, sorts: [{ propertyId: scoreId, direction: "asc", nulls: "last" }] });
    const rows = screen.getAllByRole("row").filter((row) => row.querySelector(".ph-file"));
    expect(rows.map((row) => row.querySelector(".ph-file")?.parentElement?.textContent?.replace("숫자 ", ""))).toEqual(["2", "10.0000", "9007199254740993123456789012345678", "9007199254740993123456789012345679"]);
  });
  it("compares numeric filters against canonical decimals without string ordering", () => {
    const records = ["2.0000", "10", "20"].map((value, index) => ({ ...record, id: id.slice(0, -1) + (index + 1), title: "필터 " + value, propertyValues: [{ propertyDefinitionId: scoreId, type: "number" as const, value }] }));
    setup(records, { ...view, filter: { propertyId: scoreId, operator: "eq", operand: { type: "number", value: 2 } } });
    expect(screen.getByRole("gridcell", { name: "필터 2.0000" })).toBeTruthy();
    expect(screen.queryByRole("gridcell", { name: "필터 10" })).toBeNull();
  });
  it("sorts datetime instants across offsets while preserving nanoseconds", () => {
    const starts = ["2026-09-01T12:00:00.000000002+09:00", "2026-09-01T03:00:00.000000001Z", "2026-09-01T04:00:00+02:00"];
    const records = starts.map((start, index) => ({ ...record, id: id.slice(0, -1) + (index + 1), title: "시간 " + index, propertyValues: [{ propertyDefinitionId: dateId, type: "date" as const, value: { precision: "datetime" as const, start, end: null, timezone: null } }] }));
    setup(records, { ...view, sorts: [{ propertyId: dateId, direction: "asc", nulls: "last" }] });
    const rows = screen.getAllByRole("row").filter((row) => row.querySelector(".ph-file"));
    expect(rows.map((row) => row.querySelector(".ph-file")?.parentElement?.textContent)).toEqual(["시간 2", "시간 1", "시간 0"]);
  });
  it("sends an edited custom timestamp exactly as a single canonical datetime", async () => {
    const timestampCategory: CareerCategory = { ...category, propertySchemaV2: [{ ...category.propertySchemaV2![2]!, type: "created_time" }] };
    const timestampRecord: CareerRecord = { ...record, propertyValues: [{ propertyDefinitionId: noteId, type: "date", value: { precision: "datetime", start: "2026-09-01T12:30:00.123456789+09:00", end: null, timezone: "Asia/Seoul" } }] };
    const requests = setup([timestampRecord], { ...view, visiblePropertyIds: [noteId], propertyOrder: [noteId] }, false, timestampCategory);
    const cell = screen.getByRole("gridcell", { name: "2026-09-01T12:30:00.123456789+09:00" });
    fireEvent.focus(cell); fireEvent.keyDown(cell, { key: "F2" });
    const input = screen.getByLabelText("메모 셀 편집");
    fireEvent.change(input, { target: { value: "2026-09-02T12:30:00.000000001+09:00" } }); fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(requests[0]?.body).toEqual({ propertyValues: { set: [{ propertyDefinitionId: noteId, type: "date", value: { precision: "datetime", start: "2026-09-02T12:30:00.000000001+09:00", end: null, timezone: "Asia/Seoul" } }], unsetPropertyIds: [] } }));
  });
  it("keeps a rejected canonical cell intent for explicit conflict recovery", async () => {
    const requests = setup([record], view, true);
    const cell = screen.getByRole("gridcell", { name: "123.4500" });
    fireEvent.focus(cell); fireEvent.keyDown(cell, { key: "F2" });
    const input = screen.getByLabelText("점수 셀 편집");
    fireEvent.change(input, { target: { value: "9007199254740993123456789012345678" } });
    fireEvent.keyDown(input, { key: "Enter" });
    const patch = { propertyValues: { set: [{ propertyDefinitionId: scoreId, type: "number", value: "9007199254740993123456789012345678" }], unsetPropertyIds: [] } };
    await waitFor(() => expect(screen.getByRole("gridcell", { name: "123.4500" }).getAttribute("data-issue")).toBe("true"));
    expect(requests).toEqual([{ method: "PATCH", body: patch }]);
  });
  it("edits a month date without a calendar day conversion", async () => {
    const monthRecord = { ...record, propertyValues: [{ propertyDefinitionId: dateId, type: "date" as const, value: { precision: "month" as const, start: "2026-09", end: null } }] };
    const requests = setup([monthRecord]);
    const cell = screen.getByRole("gridcell", { name: "2026-09" });
    fireEvent.focus(cell); fireEvent.keyDown(cell, { key: "F2" });
    const input = screen.getByLabelText("기간 시작");
    expect((input as HTMLInputElement).value).toBe("2026-09");
    fireEvent.change(input, { target: { value: "2026-10" } }); fireEvent.blur(input);
    await waitFor(() => expect(requests[0]?.body).toEqual({ propertyValues: { set: [{ propertyDefinitionId: dateId, type: "date", value: { precision: "month", start: "2026-10", end: null } }], unsetPropertyIds: [] } }));
  });
  it("keeps freeform tag creation available from a canonical table cell", async () => {
    const tagCategory: CareerCategory = { ...category, propertySchemaV2: [{ ...category.propertySchemaV2![2]!, type: "multi_select", config: { legacyFreeformTags: true, options: [{ id: scoreId, name: "React" }] } }] };
    const tagRecord: CareerRecord = { ...record, propertyValues: [{ propertyDefinitionId: noteId, type: "multi_select", value: [scoreId] }] };
    const labels: string[] = [];
    const requests = setup([tagRecord], { ...view, visiblePropertyIds: [noteId], propertyOrder: [noteId] }, false, tagCategory, async (_definition, label) => { labels.push(label); return { id: dateId, name: label }; });
    const cell = screen.getByRole("gridcell", { name: "React" });
    fireEvent.focus(cell); fireEvent.keyDown(cell, { key: "F2" });
    const input = screen.getByLabelText("메모 태그 추가");
    fireEvent.change(input, { target: { value: "  Go  " } }); fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(requests[0]?.body).toEqual({ propertyValues: { set: [{ propertyDefinitionId: noteId, type: "multi_select", value: [scoreId, dateId] }], unsetPropertyIds: [] } }));
    expect(labels).toEqual(["  Go  "]);
  });
  it("registers private tags through the actual BFF callback and keeps the label after closing the cell",async()=>{
    const tagCategory:CareerCategory={...category,propertySchemaV2:[{...category.propertySchemaV2![2]!,type:"multi_select",config:{legacyFreeformTags:true,options:[{id:scoreId,name:"React"}]}}]};
    const tagRecord:CareerRecord={...record,propertyValues:[{propertyDefinitionId:noteId,type:"multi_select",value:[scoreId]}]};
    setup([tagRecord],{...view,visiblePropertyIds:[noteId],propertyOrder:[noteId]},false,tagCategory);
    const requests:{url:string;body:unknown}[]=[];
    vi.stubGlobal("fetch",vi.fn(async(url:string,init?:RequestInit)=>{
      requests.push({url,body:JSON.parse(String(init?.body))});
      if(url.endsWith("/options"))return Response.json({data:{id:dateId,name:"  Go  "},version:1});
      return Response.json({data:{...tagRecord,version:2,propertyValues:[{propertyDefinitionId:noteId,type:"multi_select",value:[scoreId,dateId]}]}});
    }));
    const cell=screen.getByRole("gridcell",{name:"React"});fireEvent.focus(cell);fireEvent.keyDown(cell,{key:"F2"});
    const input=screen.getByLabelText("메모 태그 추가");fireEvent.change(input,{target:{value:"  Go  "}});fireEvent.keyDown(input,{key:"Enter"});
    await waitFor(()=>expect(requests).toEqual([
      {url:`/api/career/categories/${id}/property-schema/${noteId}/options`,body:{label:"  Go  "}},
      {url:`/api/career/records/${id}`,body:{propertyValues:{set:[{propertyDefinitionId:noteId,type:"multi_select",value:[scoreId,dateId]}],unsetPropertyIds:[]}}}
    ]));
    fireEvent.keyDown(document,{key:"Escape"});
    await waitFor(()=>expect(screen.getByRole("gridcell",{name:/React.*Go/}).textContent).toContain("  Go  "));
  });
  it("refreshes private option definitions from new category props", async () => {
    const tags = { ...category.propertySchemaV2![2]!, type: "multi_select" as const, config: { legacyFreeformTags: true, options: [{ id: scoreId, name: "  First  " }] } };
    const currentCategory: CareerCategory = { ...category, propertySchemaV2: [tags] };
    const currentRecord: CareerRecord = { ...record, propertyValues: [{ propertyDefinitionId: noteId, type: "multi_select", value: [scoreId] }] };
    const props = { category: currentCategory, initialView: { ...view, visiblePropertyIds: [noteId], propertyOrder: [noteId] }, initialPage: { data: [currentRecord], page: { hasNextPage: false, nextCursor: null } } };
    const rendered = render(<CareerViewShell {...props} />);
    expect(screen.getByRole("gridcell", { name: "First" }).textContent).toBe("  First  ");
    rendered.rerender(<CareerViewShell {...props} category={{ ...currentCategory, propertySchemaV2: [{ ...tags, config: { ...tags.config, options: [{ id: scoreId, label: "  Refreshed  " }] } }] }} />);
    await waitFor(() => expect(screen.getByRole("gridcell", { name: "Refreshed" }).textContent).toBe("  Refreshed  "));
  });  it("uses canonical project outcomes and periods in the gallery and quick filters", () => {
    const projectCategory: CareerCategory = { ...category, key: "project", propertySchemaV2: category.propertySchemaV2!.map((definition) => definition.id === noteId ? { ...definition, key: "outcome" } : definition) };
    const projectRecord: CareerRecord = { ...record, properties: { outcome: { type: "text", value: "" } }, propertyValues: [{ propertyDefinitionId: noteId, type: "text", value: "100% 개선" }, { propertyDefinitionId: dateId, type: "date", value: { precision: "month", start: "2026-09", end: null } }] };
    setup([projectRecord], { ...view, type: "gallery" }, false, projectCategory);
    expect(screen.getByText("1개 · 성과 수치 없음 0")).toBeTruthy();
    expect(screen.getByText("2026.09 –")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "성과 비어 있음 0" }));
    expect(screen.queryByRole("button", { name: /원본 기록.*100% 개선/ })).toBeNull();
  });
  it("displays canonical project tag names from option IDs without trimming labels", () => {
    const tagCategory: CareerCategory = { ...category, key: "project", propertySchemaV2: [{ ...category.propertySchemaV2![0]!, key: "technologies", type: "multi_select", config: { options: [{ id, name: "  React  " }], legacyFreeformTags: true } }] };
    const tagRecord: CareerRecord = { ...record, propertyValues: [{ propertyDefinitionId: scoreId, type: "multi_select", value: [id] }] };
    setup([tagRecord], { ...view, type: "gallery" }, false, tagCategory);
    expect(screen.getByText("React").textContent).toBe("  React  ");
  });
  it("duplicates canonical arrays directly with their decimal and date precision", async () => {
    const requests = setup();
    fireEvent.contextMenu(screen.getByRole("gridcell", { name: "원본 기록" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "기록 복제" }));
    await waitFor(() => expect(requests[0]).toEqual({ method: "POST", body: { categoryId: id, title: "원본 기록 복제", bodyMd: "본문", propertyValues: values } }));
  });
});
describe("pending canonical Career table", () => {
  it.each([true, false])("resumes explicitly and refreshes a %s local view without losing precise values", async (local) => {
    const pendingRecord: CareerRecord = { ...record, pendingPropertyMutation: { jobId: dateId, status: "failed", retryable: true, sourceProperty: null } };
    const updated: CareerRecord = { ...record, title: "새로운 기록", version: 2, propertyValues: [{ propertyDefinitionId: scoreId, type: "number", value: "123.4500" }] };
    const configuration = { ...view, id: local ? view.id : noteId };
    const calls: Array<{ url: string; method: string | undefined; body: string | undefined }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method, body: typeof init?.body === "string" ? init.body : undefined });
      if (url.endsWith("/resume")) return Response.json({ data: { id: dateId, categoryId: id, propertyId: scoreId, status: "running", active: true, processedCount: 0, totalCount: 1, retryable: false, updatedAt: record.updatedAt, completedAt: null } });
      if (url === "/api/career/property-mutations/" + dateId) return Response.json({ data: { id: dateId, categoryId: id, propertyId: scoreId, status: "completed", active: false, processedCount: 1, totalCount: 1, retryable: false, updatedAt: record.updatedAt, completedAt: record.updatedAt } });
      if (url === "/api/career/categories") return Response.json({ data: [category] });
      if (url.endsWith("/query?limit=50")) return Response.json({ data: [updated], page: { hasNextPage: false, nextCursor: null } });
      return Response.json({ data: updated, resource: { version: 2, updatedAt: record.updatedAt } });
    }));
    render(<CareerViewShell category={category} initialView={configuration} initialPage={{ data: [pendingRecord], page: { hasNextPage: false, nextCursor: null } }} />);
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "속성 변경 다시 시작" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "속성 변경 다시 시작" })).toBeNull());
    await waitFor(() => expect(screen.getByRole("gridcell", { name: "123.4500" }).getAttribute("aria-readonly")).toBe("false"));
    expect(screen.getByRole("gridcell", { name: "새로운 기록" })).toBeTruthy();
    expect(calls[0]).toEqual({ url: "/api/career/property-mutations/" + dateId + "/resume", method: "POST", body: "{}" });
    expect(calls.some((call) => call.url === (local ? "/api/career/records/" + id : "/api/career/view-configurations/" + noteId + "/query?limit=50"))).toBe(true);
  });
  it("keeps a resumed running job read-only without another automatic mutation request", async () => {
    const pending = { jobId: dateId, status: "failed" as const, retryable: true, sourceProperty: null };
    const runningRecord: CareerRecord = { ...record, pendingPropertyMutation: { ...pending, status: "running", retryable: false } };
    const requests: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      requests.push(url);
      if (url.endsWith("/resume")) return Response.json({ data: { id: dateId, categoryId: id, propertyId: scoreId, status: "running", active: true, processedCount: 0, totalCount: 1, retryable: false, updatedAt: record.updatedAt, completedAt: null } });
      if (url === "/api/career/property-mutations/" + dateId) return Response.json({ data: { id: dateId, categoryId: id, propertyId: scoreId, status: "running", active: true, processedCount: 0, totalCount: 1, retryable: false, updatedAt: record.updatedAt, completedAt: null } });
      if (url === "/api/career/categories") return Response.json({ data: [category] });
      return Response.json({ data: runningRecord, resource: { version: 1, updatedAt: record.updatedAt } });
    }));
    render(<CareerViewShell category={category} initialView={view} initialPage={{ data: [{ ...record, pendingPropertyMutation: pending }], page: { hasNextPage: false, nextCursor: null } }} />);
    fireEvent.click(screen.getByRole("button", { name: "속성 변경 다시 시작" }));
    await waitFor(() => expect(screen.getByLabelText("속성 변경 상태").textContent).toContain("변경하고 있습니다"));
    expect(screen.queryByRole("button", { name: "속성 변경 다시 시작" })).toBeNull();
    expect(screen.getByRole("gridcell", { name: "123.4500" }).getAttribute("aria-readonly")).toBe("true");
    expect(requests.filter((url) => url.endsWith("/resume"))).toHaveLength(1);
  });
  it("retains the business guard when the resume response fails contract validation", async () => {
    const pendingRecord: CareerRecord = { ...record, pendingPropertyMutation: { jobId: dateId, status: "failed", retryable: true, sourceProperty: null } };
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ data: { id: dateId, operationFingerprint: "private" } })));
    render(<CareerViewShell category={category} initialView={view} initialPage={{ data: [pendingRecord], page: { hasNextPage: false, nextCursor: null } }} />);
    fireEvent.click(screen.getByRole("button", { name: "속성 변경 다시 시작" }));
    expect((await screen.findByRole("alert")).textContent).toBe("속성 변경 응답을 확인하지 못했습니다.");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("gridcell", { name: "123.4500" }).getAttribute("aria-readonly")).toBe("true");
  });  it("keeps an injected resume callback as the mutation action", async () => {
    const pendingRecord: CareerRecord = { ...record, pendingPropertyMutation: { jobId: dateId, status: "failed", retryable: true, sourceProperty: null } };
    const resume = vi.fn(async (_jobId: string) => undefined);
    vi.stubGlobal("fetch", vi.fn(async (url: string) => url === "/api/career/property-mutations/" + dateId ? Response.json({ data: { id: dateId, categoryId: id, propertyId: scoreId, status: "completed", active: false, processedCount: 1, totalCount: 1, retryable: false, updatedAt: record.updatedAt, completedAt: record.updatedAt } }) : url === "/api/career/categories" ? Response.json({ data: [category] }) : Response.json({ data: record, resource: { version: 1, updatedAt: record.updatedAt } })));
    render(<CareerViewShell category={category} initialView={view} initialPage={{ data: [pendingRecord], page: { hasNextPage: false, nextCursor: null } }} onResumePropertyMutation={resume} />);
    expect(resume).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "속성 변경 다시 시작" }));
    await waitFor(() => expect(resume).toHaveBeenCalledExactlyOnceWith(dateId));
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).endsWith("/resume"))).toBe(false);
  });
  it("reads source options and blocks cell edits, clear actions, title edits and bulk status", () => {
    const source = { ...category.propertySchemaV2![0]!, type: "select" as const, config: { options: [{ id: noteId, name: "원래 옵션" }] } };
    const pendingRecord: CareerRecord = { ...record, propertyValues: [{ propertyDefinitionId: scoreId, type: "select", value: noteId }], pendingPropertyMutation: { jobId: dateId, status: "running", retryable: false, sourceProperty: source } };
    const requests = setup([pendingRecord]);
    const cell = screen.getByRole("gridcell", { name: "원래 옵션" });
    expect(cell.getAttribute("aria-readonly")).toBe("true");
    fireEvent.focus(cell); fireEvent.keyDown(cell, { key: "F2" });
    expect(screen.queryByLabelText("점수 셀 편집")).toBeNull();
    fireEvent.contextMenu(cell);
    expect((screen.getByRole("menuitem", { name: "셀 편집" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("menuitem", { name: "값 지우기" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(document, { key: "Escape" });
    const title = screen.getByRole("gridcell", { name: "원본 기록" });
    fireEvent.focus(title); fireEvent.keyDown(title, { key: "F2" });
    expect(screen.queryByLabelText("제목 셀 편집")).toBeNull();
    fireEvent.click(screen.getByLabelText("원본 기록 선택"));
    expect((screen.getByRole("button", { name: "정리됨" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("status").textContent).toContain("본문");
    expect(requests).toEqual([]);
  });
});describe("in-flight canonical type comparisons", () => {
  it("keeps source text sortable after its target definition becomes a date", () => {
    const source = { ...category.propertySchemaV2![0]!, type: "text" as const };
    const targetCategory: CareerCategory = { ...category, propertySchemaV2: [{ ...source, type: "date" }] };
    const records: CareerRecord[] = ["notTime", "otherText"].map((value, index) => ({ ...record, id: id.slice(0, -1) + (index + 1), title: "원본 " + index, propertyValues: [{ propertyDefinitionId: scoreId, type: "text", value }], pendingPropertyMutation: { jobId: dateId, status: "running", retryable: false, sourceProperty: source } }));
    setup(records, { ...view, visiblePropertyIds: [scoreId], propertyOrder: [scoreId], sorts: [{ propertyId: scoreId, direction: "asc", nulls: "last" }] }, false, targetCategory);
    expect(screen.getByRole("gridcell", { name: "notTime" })).toBeTruthy();
    expect(screen.getByRole("gridcell", { name: "otherText" })).toBeTruthy();
  });
});
it("duplicates current canonical relation projections alongside exact scalar values", async () => {
  const relationId = "00000000-0000-4000-8000-000000000005";
  const relationCategory: CareerCategory = { ...category, propertySchemaV2: [...category.propertySchemaV2!, { id: relationId, key: "related", name: "Related", type: "relation", required: false, system: false, config: { targetCategoryId: id, cardinality: "multiple", deletePolicy: "restrict" }, order: 4, version: 1, deletedAt: null }] };
  const relatedRecord: CareerRecord = { ...record, properties: { ...record.properties, related: { type: "relation", value: [{ recordId: scoreId, title: "Owned target" }] } } };
  const requests = setup([relatedRecord], view, false, relationCategory);
  fireEvent.contextMenu(screen.getByRole("gridcell", { name: "원본 기록" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "기록 복제" }));
  await waitFor(() => expect(requests[0]?.body).toEqual({ categoryId: id, title: "원본 기록 복제", bodyMd: "본문", propertyValues: values, initialRelations: [{ propertyId: relationId, targetIds: [scoreId] }] }));
});
it("does not duplicate an omitted relation projection while its source is pending", async () => {
  const requests = setup([{ ...record, pendingRelationPropertyIds: [noteId] }]);
  fireEvent.contextMenu(screen.getByRole("gridcell", { name: "원본 기록" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "기록 복제" }));
  expect(await screen.findByText(/관계 변경.*완료.*복제/)).toBeTruthy();
  expect(requests).toEqual([]);
});
it.each(["is_empty","is_not_empty","not_contains","neq"])("does not resolve pending relation through the %s local filter",operator=>{
 const relationId="00000000-0000-4000-8000-000000000005";
 const relationCategory:CareerCategory={...category,propertySchemaV2:[...category.propertySchemaV2!,{id:relationId,key:"related",name:"Related",type:"relation",required:false,system:false,config:{targetCategoryId:id,cardinality:"multiple",deletePolicy:"restrict"},order:4,version:1,deletedAt:null}]};
 const pending={...record,title:"Unknown pending",pendingRelationPropertyIds:[relationId]};
 const empty={...record,id:id.slice(0,-1)+"8",title:"Known empty",properties:{related:{type:"relation" as const,value:[]}}};
 const filled={...record,id:id.slice(0,-1)+"9",title:"Known filled",properties:{related:{type:"relation" as const,value:[{recordId:scoreId,title:"Target"}]}}};
 setup([pending,empty,filled],{...view,filter:{propertyId:relationId,operator,operand:{type:"text",value:"Target"}}},false,relationCategory);
 expect(screen.queryByRole("gridcell",{name:"Unknown pending"})).toBeNull();
 expect(screen.getAllByRole("row").length).toBeGreaterThan(1);
});
it("still evaluates unrelated fields while a relation is pending",()=>{
 const pending={...record,title:"Unrelated remains visible",pendingRelationPropertyIds:[noteId]};
 setup([pending],{...view,filter:{propertyId:scoreId,operator:"eq",operand:{type:"number",value:123.45}}});
 expect(screen.getByRole("gridcell",{name:"Unrelated remains visible"})).toBeTruthy();
});