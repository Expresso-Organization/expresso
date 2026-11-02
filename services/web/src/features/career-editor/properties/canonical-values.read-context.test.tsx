// @vitest-environment jsdom
import type { CareerBusinessPropertyValue, CareerPropertyDefinitionV2, CareerRecord, CareerRecordListItem } from "@expresso/contracts";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { canonicalDisplayValue, canonicalReadDefinition, canonicalReadDefinitions } from "./canonical-values";
import { PropertyList } from "./PropertyList";
import { CareerTableCell } from "../views/CareerTableCell";
const id="00000000-0000-4000-8000-000000000001", propertyId="00000000-0000-4000-8000-000000000002", removedId="00000000-0000-4000-8000-000000000003", keptId="00000000-0000-4000-8000-000000000004", foreignId="00000000-0000-4000-8000-000000000005";
const target:CareerPropertyDefinitionV2={id:propertyId,key:"tags",name:"태그",type:"multi_select",required:false,system:false,config:{options:[{id:keptId,name:"  새 이름  "}]},order:1,version:2,deletedAt:null};
const source:CareerPropertyDefinitionV2={...target,version:1,config:{options:[{id:removedId,label:"  제거된 🧡 태그  "},{id:keptId,name:"  원래 이름  "}]}};
const values:CareerBusinessPropertyValue[]=[{propertyDefinitionId:propertyId,type:"multi_select",value:[removedId,keptId]}];
function pending(status:NonNullable<CareerRecord["pendingPropertyMutation"]>["status"], sourceProperty:CareerPropertyDefinitionV2|null=source, propertyValues=values):CareerRecordListItem {
 return {id,categoryId:id,categoryKey:"test",title:"기록",status:"draft",origin:"manual",properties:{tags:{type:"multi_select",value:[foreignId]}},propertyValues,bodyMd:"live document",version:1,updatedAt:"2026-10-09T00:00:00Z",isEmpty:false,periodFrom:null,periodTo:null,linkCount:0,usedInCount:0,pendingPropertyMutation:{jobId:id,status,retryable:status!=="failed",sourceProperty}};
}
function renderReadCells(record: CareerRecordListItem) {
 const noop=()=>{};
 render(<><PropertyList record={record} definitions={[target]} categoryId={id}/><CareerTableCell record={record} definition={target} active={false} editing={false} cellRef={noop} onFocus={noop} onEdit={noop} onCommit={noop} onCancel={noop} onMove={noop} onContextMenu={noop} onOpenRecord={noop}/></>);
}
afterEach(cleanup);
it.each(["pending","failed"] as const)("renders frozen exact labels for same-type option removal while %s",status=>{
 const record=pending(status);
 const resolved=canonicalReadDefinition(record,target);
 expect(canonicalDisplayValue(resolved,values[0]!)).toBe("  제거된 🧡 태그  ,   원래 이름  ");
 renderReadCells(record);
 expect(screen.getByLabelText("태그").textContent).toBe("  제거된 🧡 태그  ,   원래 이름  ");
 expect(screen.getByRole("gridcell").textContent).toBe("  제거된 🧡 태그    원래 이름  ");
 expect(screen.getByRole("gridcell").getAttribute("aria-readonly")).toBe("true");
 expect(screen.queryByText(removedId)).toBeNull();
 expect(screen.getByLabelText("제목")).toHaveProperty("disabled",true);
});
it.each(["pending","failed"] as const)("uses target labels for already-converted selected IDs while %s",status=>{
 const record=pending(status,source,[{propertyDefinitionId:propertyId,type:"multi_select",value:[keptId]}]);
 const resolved=canonicalReadDefinition(record,target);
 expect(resolved).toBe(target);
 expect(canonicalDisplayValue(resolved,record.propertyValues![0]!)).toBe("  새 이름  ");
 renderReadCells(record);
 expect(screen.getByLabelText("태그").textContent).toBe("  새 이름  ");
 expect(screen.getByRole("gridcell").textContent).toBe("  새 이름  ");
});
it("resolves removed select IDs but preserves target null and empty multi-select semantics",()=>{
 const targetSelect={...target,type:"select" as const},sourceSelect={...source,type:"select" as const};
 const removed=pending("pending",sourceSelect,[{propertyDefinitionId:propertyId,type:"select",value:removedId}]);
 expect(canonicalDisplayValue(canonicalReadDefinition(removed,targetSelect),removed.propertyValues![0]!)).toBe("  제거된 🧡 태그  ");
 const nullSelection=pending("pending",sourceSelect,[{propertyDefinitionId:propertyId,type:"select",value:null}]);
 expect(canonicalReadDefinition(nullSelection,targetSelect)).toBe(targetSelect);
 const empty=pending("pending",source,[{propertyDefinitionId:propertyId,type:"multi_select",value:[]}]);
 expect(canonicalReadDefinition(empty,target)).toBe(target);
});
it("fails closed for a different property or a source option set that cannot explain every selected ID",()=>{
 const wrongProperty={...source,id:foreignId};
 expect(canonicalReadDefinition(pending("pending",wrongProperty),target)).toBe(target);
 expect(canonicalReadDefinitions(pending("pending",wrongProperty),[target])).toEqual([target]);
 const incompatible={...source,config:{options:[{id:removedId,name:"private source label"}]}};
 expect(canonicalReadDefinition(pending("failed",incompatible),target)).toBe(target);
 expect(canonicalReadDefinitions(pending("failed",incompatible),[{...target,deletedAt:"2026-10-09T00:00:00Z"}])).toEqual([]);
});
it("shows a deleted source only when an authenticated record overlay and matching canonical value are present",()=>{
 const deleted={...target,deletedAt:"2026-10-09T00:00:00Z"};
 expect(canonicalReadDefinitions(pending("pending"),[deleted])).toEqual([{...source,deletedAt:null}]);
 expect(canonicalReadDefinitions(pending("failed"),[])).toEqual([{...source,deletedAt:null}]);
 expect(canonicalReadDefinitions(pending("pending",source,[]),[deleted])).toEqual([]);
 expect(canonicalReadDefinitions({...pending("pending"),pendingPropertyMutation:undefined},[deleted])).toEqual([]);
});
it("keeps private frozen labels confined to the supplied record without mutating target definitions",()=>{
 const before=structuredClone(target);
 expect(canonicalDisplayValue(canonicalReadDefinition(pending("failed"),target),values[0]!)).toContain("  제거된 🧡 태그  ");
 const withoutOverlay={...pending("pending"),pendingPropertyMutation:undefined};
 expect(canonicalReadDefinition(withoutOverlay,target)).toBe(target);
 expect(canonicalDisplayValue(canonicalReadDefinition(withoutOverlay,target),values[0]!)).toBe(removedId+",   새 이름  ");
 expect(target).toEqual(before);
});
it.each(["created_time","updated_time"] as const)("matches custom %s only to a single datetime and retains type-change source rendering",type=>{
 const numeric={...target,type:"number" as const,config:{}};
 const timestamp={...source,type,config:{}};
 const date:CareerBusinessPropertyValue={propertyDefinitionId:propertyId,type:"date",value:{precision:"datetime",start:"2026-10-09T10:00:00.123456789+09:00",end:null,timezone:"Asia/Seoul"}};
 expect(canonicalReadDefinition(pending("pending",timestamp,[date]),numeric)).toEqual(timestamp);
 expect(canonicalDisplayValue(canonicalReadDefinition(pending("pending",timestamp,[date]),numeric),date)).toBe("2026-10-09T10:00:00.123456789+09:00 (Asia/Seoul)");
 const month:CareerBusinessPropertyValue={propertyDefinitionId:propertyId,type:"date",value:{precision:"month",start:"2026-10",end:null}};
 const range:CareerBusinessPropertyValue={...date,value:{...date.value,end:"2026-10-10T10:00:00.123456789+09:00"}};
 for(const [sourceProperty,value] of [[timestamp,month],[timestamp,range],[{...timestamp,system:true},date]] as const) expect(canonicalReadDefinition(pending("failed",sourceProperty,[value]),numeric)).toBe(numeric);
});
