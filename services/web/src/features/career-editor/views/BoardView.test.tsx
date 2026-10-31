// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { CareerCategory, CareerRecord, CareerViewConfiguration } from "@expresso/contracts";
import { BoardView } from "./BoardView";
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const relationId=id(2);
const category:CareerCategory={id:id(1),key:"project",name:"프로젝트",icon:"folder",defaultView:"board",schemaVersion:1,sortOrder:0,recordCount:3,version:1,propertySchemaV2:[{id:relationId,key:"related",name:"관계",type:"relation",required:false,system:false,config:{},order:0,version:1,deletedAt:null}]};
const view:CareerViewConfiguration={id:id(3),categoryId:category.id,name:"보드",type:"board",version:1,order:0,filter:null,sorts:[],groupPropertyId:relationId,groupOrder:[],recordOrder:[],visiblePropertyIds:[],propertyOrder:[],columnWidths:{},gallery:null,board:null,timeline:null,createdAt:"2026-09-01T00:00:00.000Z",updatedAt:"2026-09-01T00:00:00.000Z"};
const record=(n:number,title:string,relations:{recordId:string;title:string}[],pending=false):CareerRecord=>({id:id(n),categoryId:category.id,title,status:"draft",origin:"manual",bodyMd:"",properties:{related:{type:"relation",value:relations}},version:1,updatedAt:view.updatedAt,...(pending?{pendingRelationPropertyIds:[relationId]}:{})});
const renderBoard=(records:CareerRecord[],nextView=view)=>render(<BoardView records={records} view={nextView} category={category} activeId={null} openId={null} selectedIds={new Set()} onActivate={vi.fn()} onCreate={vi.fn()} onFillMissing={vi.fn()} onToggle={vi.fn()} onViewChange={vi.fn()}/>);
afterEach(cleanup);
it("keeps pending relations distinct from real empty relations and resolved values",()=>{
 renderBoard([record(4,"실제 빈 관계",[]),record(5,"확인 중 기록",[],true),record(6,"확정 기록",[{recordId:id(7),title:"관계 확인 중"}])]);
 expect(within(screen.getByRole("region",{name:"—"})).getByRole("button",{name:"실제 빈 관계"})).toBeTruthy();
 const pending=screen.getAllByRole("region",{name:"관계 확인 중"});
 expect(pending).toHaveLength(2);
 expect(pending.map(group=>within(group).queryByRole("button",{name:"확인 중 기록"})).filter(Boolean)).toHaveLength(1);
 expect(within(screen.getByRole("region",{name:"—"})).queryByRole("button",{name:"확인 중 기록"})).toBeNull();
});
it("keeps status grouping unchanged when no relation grouping is selected",()=>{
 renderBoard([record(4,"실제 빈 관계",[]),record(5,"확인 중 기록",[],true)],{...view,groupPropertyId:null});
 expect(within(screen.getByRole("region",{name:"draft"})).getAllByRole("article")).toHaveLength(2);
 expect(screen.queryByRole("region",{name:"관계 확인 중"})).toBeNull();
});