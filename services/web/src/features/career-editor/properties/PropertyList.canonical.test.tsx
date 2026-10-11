// @vitest-environment jsdom
import type { CareerBusinessPropertyValue, CareerPropertyDefinitionV2, CareerRecordListItem } from "@expresso/contracts";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PropertyList } from "./PropertyList";
import { CanonicalPropertyValueEditor } from "./CanonicalPropertyValueEditor";

const recordId = "00000000-0000-4000-8000-000000000001";
const scoreId = "00000000-0000-4000-8000-000000000002";
const dateId = "00000000-0000-4000-8000-000000000003";
const noteId = "00000000-0000-4000-8000-000000000004";
const selectId = "00000000-0000-4000-8000-000000000005";
const optionId = "00000000-0000-4000-8000-000000000006";
function definition(id: string, key: string, name: string, type: CareerPropertyDefinitionV2["type"]): CareerPropertyDefinitionV2 {
  return { id, key, name, type, required: false, system: false, config: {}, order: 0, version: 1, deletedAt: null };
}
const definitions = [definition(scoreId, "score", "점수", "number"), definition(dateId, "period", "기간", "date"), definition(noteId, "note", "메모", "text"), { ...definition(selectId, "choice", "선택", "select"), config: { options: [{ id: optionId, name: "선택 A" }] } }];
function setup(propertyValues: CareerBusinessPropertyValue[]) {
  const record: CareerRecordListItem & { propertyValues: CareerBusinessPropertyValue[] } = { id: recordId, categoryId: recordId, categoryKey: "test", title: "기록", status: "draft", origin: "manual", properties: { score: 3, period: "2025-01", note: "이전 메모" }, propertyValues, bodyMd: "", version: 1, updatedAt: "2026-09-01T00:00:00Z", isEmpty: false, periodFrom: null, periodTo: null, linkCount: 0, usedInCount: 0 };
  const requests: unknown[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === "PATCH") requests.push(JSON.parse(String(init.body)));
    return new Response(JSON.stringify({ data: { ...record, version: 2 } }), { status: 200, headers: { "content-type": "application/json" } });
  }));
  const { rerender } = render(<PropertyList record={record} definitions={definitions} categoryId={recordId} />);
  return { requests, rerender, record };
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("PropertyList canonical editing", () => {
  it.each(["123.4500", "9007199254740993123456789012345678"])("sends the exact decimal %s for only its definition", async (value) => {
    const { requests } = setup([{ propertyDefinitionId: scoreId, type: "number", value: "123.4500" }]);
    const input = screen.getByLabelText("점수");
    expect((input as HTMLInputElement).value).toBe("123.4500");
    fireEvent.change(input, { target: { value } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(requests).toEqual([{ propertyValues: { set: [{ propertyDefinitionId: scoreId, type: "number", value }], unsetPropertyIds: [] } }]));
  });
  it("preserves a month date without introducing a day", async () => {
    const { requests } = setup([{ propertyDefinitionId: dateId, type: "date", value: { precision: "month", start: "2026-09", end: null } }]);
    const input = screen.getByLabelText("기간 시작");
    expect((input as HTMLInputElement).value).toBe("2026-09");
    fireEvent.change(input, { target: { value: "2026-10" } });
    fireEvent.blur(input);
    await waitFor(() => expect(requests).toEqual([{ propertyValues: { set: [{ propertyDefinitionId: dateId, type: "date", value: { precision: "month", start: "2026-10", end: null } }], unsetPropertyIds: [] } }]));
  });
  it("preserves datetime offset, nanoseconds and timezone when editing only its end", async () => {
    const start = "2026-09-01T12:30:00.123456789+09:00";
    const { requests } = setup([{ propertyDefinitionId: dateId, type: "date", value: { precision: "datetime", start, end: null, timezone: "Asia/Seoul" } }]);
    expect((screen.getByLabelText("기간 시작") as HTMLInputElement).value).toBe(start);
    const end = screen.getByLabelText("기간 종료");
    fireEvent.change(end, { target: { value: "2026-09-02T12:30:00.000000001+09:00" } });
    fireEvent.blur(end);
    await waitFor(() => expect(requests).toEqual([{ propertyValues: { set: [{ propertyDefinitionId: dateId, type: "date", value: { precision: "datetime", start, end: "2026-09-02T12:30:00.000000001+09:00", timezone: "Asia/Seoul" } }], unsetPropertyIds: [] } }]));
  });
  it("keeps unrelated precise values out of a text patch", async () => {
    const { requests } = setup([{ propertyDefinitionId: scoreId, type: "number", value: "123.4500" }, { propertyDefinitionId: dateId, type: "date", value: { precision: "datetime", start: "2026-09-01T12:30:00.123456789+09:00", end: null, timezone: "Asia/Seoul" } }, { propertyDefinitionId: noteId, type: "text", value: "메모" }]);
    fireEvent.change(screen.getByLabelText("메모"), { target: { value: "수정 메모" } });
    fireEvent.blur(screen.getByLabelText("메모"));
    await waitFor(() => expect(requests).toEqual([{ propertyValues: { set: [{ propertyDefinitionId: noteId, type: "text", value: "수정 메모" }], unsetPropertyIds: [] } }]));
  });
  it("explicitly unsets a cleared number", async () => {
    const { requests } = setup([{ propertyDefinitionId: scoreId, type: "number", value: "123.4500" }]);
    fireEvent.change(screen.getByLabelText("점수"), { target: { value: "" } });
    fireEvent.blur(screen.getByLabelText("점수"));
    await waitFor(() => expect(requests).toEqual([{ propertyValues: { set: [], unsetPropertyIds: [scoreId] } }]));
  });
  it("sets select null while retaining its definition ID", async () => {
    const { requests } = setup([{ propertyDefinitionId: selectId, type: "select", value: optionId }]);
    fireEvent.click(screen.getByRole("button", { name: "선택" }));
    fireEvent.click(screen.getByRole("option", { name: "선택 안 함" }));
    await waitFor(() => expect(requests).toEqual([{ propertyValues: { set: [{ propertyDefinitionId: selectId, type: "select", value: null }], unsetPropertyIds: [] } }]));
  });
  it("refreshes canonical values when a newer record arrives from bootstrap", () => {
    const { rerender, record } = setup([{ propertyDefinitionId: noteId, type: "text", value: "원본" }]);
    rerender(<PropertyList record={{ ...record, version: 3, propertyValues: [{ propertyDefinitionId: noteId, type: "text", value: "새 원본" }] }} definitions={definitions} categoryId={recordId} />);
    expect((screen.getByLabelText("메모") as HTMLInputElement).value).toBe("새 원본");
  });
  it("uses a present empty canonical array instead of legacy values", () => {
    setup([]);
    expect((screen.getByLabelText("점수") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("메모") as HTMLInputElement).value).toBe("");
  });
});

describe("canonical freeform tags", () => {
  it("registers an exact new tag label before setting stable option IDs", async () => {
    const committed: unknown[] = [];
    const labels: string[] = [];
    render(<CanonicalPropertyValueEditor definition={{ ...definitions[3]!, type: "multi_select", config: { legacyFreeformTags: true, options: [{ id: optionId, name: "React" }] } }} value={{ propertyDefinitionId: selectId, type: "multi_select", value: [optionId] }} onCommit={async (value) => { committed.push(value); }} onEnsureOption={async (label) => { labels.push(label); return { id: noteId, name: label }; }} />);
    expect(screen.getByRole("button", { name: "React 태그 삭제" })).toBeTruthy();
    const input = screen.getByLabelText("선택 태그 추가");
    fireEvent.change(input, { target: { value: "  C++  " } }); fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(committed).toEqual([{ propertyDefinitionId: selectId, type: "multi_select", value: [optionId, noteId] }]));
    expect(labels).toEqual(["  C++  "]);
  });
  it("removes one freeform option ID without dropping other selected tags", async () => {
    const committed: unknown[] = [];
    render(<CanonicalPropertyValueEditor definition={{ ...definitions[3]!, type: "multi_select", config: { legacyFreeformTags: true, options: [{ id: optionId, name: "React" }, { id: noteId, name: "Go" }] } }} value={{ propertyDefinitionId: selectId, type: "multi_select", value: [optionId, noteId] }} onCommit={async (value) => { committed.push(value); }} />);
    fireEvent.click(screen.getByRole("button", { name: "React 태그 삭제" }));
    await waitFor(() => expect(committed).toEqual([{ propertyDefinitionId: selectId, type: "multi_select", value: [noteId] }]));
  });
});
describe("canonical Unicode text editing", () => {
  it("renders and commits business text by code points without the legacy UTF-16 limit", async () => {
    const value = "🧡".repeat(50_000);
    const committed: unknown[] = [];
    render(<CanonicalPropertyValueEditor definition={definitions[2]!} value={{ propertyDefinitionId: noteId, type: "text", value }} onCommit={async (next) => { committed.push(next); }} />);
    expect((screen.getByLabelText("메모") as HTMLInputElement).value).toBe(value);
    fireEvent.blur(screen.getByLabelText("메모"));
    await waitFor(() => expect(committed).toEqual([{ propertyDefinitionId: noteId, type: "text", value }]));
  });
});
describe("pending canonical property mutation reads", () => {
  function pendingRecord(sourceProperty: CareerPropertyDefinitionV2, propertyValues: CareerBusinessPropertyValue[]): CareerRecordListItem {
    return { id: recordId, categoryId: recordId, categoryKey: "test", title: "기록", status: "draft", origin: "manual", properties: {}, propertyValues, pendingPropertyMutation: { jobId: dateId, status: "failed", retryable: true, sourceProperty }, bodyMd: "본문", version: 1, updatedAt: "2026-09-01T00:00:00Z", isEmpty: false, periodFrom: null, periodTo: null, linkCount: 0, usedInCount: 0 };
  }
  it("uses the source option labels and pauses all business editors during a type change", () => {
    const source = { ...definitions[3]!, name: "원래 선택" };
    const record = pendingRecord(source, [{ propertyDefinitionId: selectId, type: "select", value: optionId }, { propertyDefinitionId: scoreId, type: "number", value: "123.4500" }]);
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    render(<PropertyList record={record} definitions={[definitions[0]!, { ...source, type: "number", name: "새 숫자", config: {} }]} categoryId={recordId} />);
    expect(screen.getByLabelText("원래 선택").textContent).toBe("선택 A");
    expect((screen.getByLabelText("제목") as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByLabelText("점수").textContent).toBe("123.4500");
    expect(screen.getByRole("status", { name: "속성 변경 상태" }).textContent).toContain("다시 시작");
    fireEvent.blur(screen.getByLabelText("제목"));
    expect(fetch).not.toHaveBeenCalled();
  });
  it("offers an explicit resume callback only for a retryable interrupted job", async () => {
    const record = pendingRecord(definitions[2]!, [{ propertyDefinitionId: noteId, type: "text", value: "원본" }]);
    const resume = vi.fn(async (_jobId: string) => undefined);
    const { rerender } = render(<PropertyList record={record} definitions={definitions} categoryId={recordId} />);
    expect(screen.queryByRole("button", { name: "속성 변경 다시 시작" })).toBeNull();
    rerender(<PropertyList record={record} definitions={definitions} categoryId={recordId} onResumePropertyMutation={resume} />);
    expect(resume).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "속성 변경 다시 시작" }));
    await waitFor(() => expect(resume).toHaveBeenCalledExactlyOnceWith(dateId));
  });
  it("keeps a deleted source value readable until its mutation completes", () => {
    const source = { ...definitions[2]!, deletedAt: "2026-09-01T00:00:00Z" };
    const record = pendingRecord(source, [{ propertyDefinitionId: noteId, type: "text", value: "삭제 대기 중인 원본" }]);
    render(<PropertyList record={record} definitions={[source]} categoryId={recordId} />);
    expect(screen.getByLabelText("메모").textContent).toBe("삭제 대기 중인 원본");
  });
});
describe("pending relation fields", () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
  it("pauses only affected relation fields and leaves unrelated values and title editable", () => {
    const relation = { ...definitions[2]!, type: "relation" as const, config: { targetCategoryId: recordId, inversePropertyId: null, cardinality: "multiple", deletePolicy: "restrict" } };
    const other = { ...relation, id: selectId, key: "other_relation", name: "다른 관계" };
    const record: CareerRecordListItem = { id: recordId, categoryId: recordId, categoryKey: "test", title: "기록", status: "draft", origin: "manual", properties: {}, propertyValues: [{ propertyDefinitionId: scoreId, type: "number", value: "123.4500" }], pendingRelationPropertyIds: [relation.id], bodyMd: "", version: 1, updatedAt: "2026-09-01T00:00:00Z", isEmpty: false, periodFrom: null, periodTo: null, linkCount: 0, usedInCount: 0 };
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ data: [] })));
    render(<PropertyList record={record} definitions={[definitions[0]!, relation, other]} categoryId={recordId} />);
    expect(screen.getByLabelText(relation.name).textContent).toContain("관계 변경");
    expect(screen.getAllByRole("combobox")).toHaveLength(1);
    expect((screen.getByLabelText("제목") as HTMLInputElement).disabled).toBe(false);
    expect((screen.getByLabelText("점수") as HTMLInputElement).disabled).toBe(false);
  });
});
describe("canonical stale property conflict",()=>{
 it.each([409,412])("does not reapply a stale property delta after HTTP %s",async status=>{
  const {record}=setup([{propertyDefinitionId:scoreId,type:"number",value:"10.0000"}]);
  let stored={...record,version:2,propertyValues:[{propertyDefinitionId:scoreId,type:"number" as const,value:"20.0000"}]};
  const before=structuredClone(stored),patches:RequestInit[]=[];
  vi.stubGlobal("fetch",vi.fn(async(_url:string,init?:RequestInit)=>{
   if(init?.method!=="PATCH")return Response.json({data:stored});
   patches.push(init);
   if(patches.length===1)return Response.json({error:{code:"CONFLICT"}},{status});
   const patch=JSON.parse(String(init.body));stored={...stored,version:3,propertyValues:patch.propertyValues.set};
   return Response.json({data:stored});
  }));
  fireEvent.change(screen.getByLabelText("점수"),{target:{value:"30.0000"}});fireEvent.blur(screen.getByLabelText("점수"));
  await waitFor(()=>{
   // 저장 중 output도 같은 label·value를 가지므로 실제 입력창이 복구될 때까지 기다립니다.
   const input=screen.getByRole("textbox",{name:"점수"}) as HTMLInputElement;
   expect(input.value).toBe("20.0000");
   expect(input.disabled).toBe(false);
  });
  expect(patches).toHaveLength(1);
  expect(new Headers(patches[0]!.headers).get("if-match")).toBe('"v1"');
  expect(stored).toEqual(before);
  expect(screen.getByRole("alert").textContent).toContain("확인 후 다시 편집");
  fireEvent.change(screen.getByLabelText("점수"),{target:{value:"40.0000"}});fireEvent.blur(screen.getByLabelText("점수"));
  await waitFor(()=>expect(stored.propertyValues[0]!.value).toBe("40.0000"));
  expect(patches).toHaveLength(2);
  expect(new Headers(patches[1]!.headers).get("if-match")).toBe('"v2"');
 });
});