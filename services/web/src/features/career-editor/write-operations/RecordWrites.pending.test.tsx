// @vitest-environment jsdom
import { webcrypto } from "node:crypto";
import type { CareerCategory, CareerRecord, CareerRecordListItem, CareerViewConfiguration, CareerWriteOperation } from "@expresso/contracts";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/app/(app)/career/[categorySlug]/DocumentPanel", () => ({ DocumentPanel: () => null }));
import { CareerViewShell } from "../views/CareerViewShell";
import { PropertyList } from "../properties/PropertyList";
const id="00000000-0000-4000-8000-000000000001", propertyId="00000000-0000-4000-8000-000000000002", operationId="00000000-0000-4000-8000-000000000003", otherId="00000000-0000-4000-8000-000000000004";
const definition={id:propertyId,key:"number",name:"정밀값",type:"number" as const,system:false,required:false,config:{},order:0,version:1,deletedAt:null};
const category:CareerCategory={id,key:"test",name:"테스트",icon:"table",defaultView:"table",isSystem:false,propertySchema:{},propertySchemaV2:[definition],sortOrder:0,recordCount:1,version:1};
const record:CareerRecord={id,categoryId:id,title:"원본",status:"draft",origin:"manual",properties:{},propertyValues:[{propertyDefinitionId:propertyId,type:"number",value:"123.4500"}],bodyMd:"live",version:1,updatedAt:"2026-09-01T00:00:00Z"};
const view:CareerViewConfiguration={id:"local-test",categoryId:id,name:"표",type:"table",order:0,filter:null,sorts:[],groupPropertyId:null,groupOrder:[],recordOrder:[],visiblePropertyIds:[propertyId],propertyOrder:[propertyId],columnWidths:{},gallery:null,board:null,timeline:null,version:1,createdAt:"2026-09-01T00:00:00Z",updatedAt:"2026-09-01T00:00:00Z"};
const operation:CareerWriteOperation={operationId,producer:"career-product",state:"pending",recordId:id,owners:{business:"pending",document:"not-required"},statusUrl:"/v1/career/write-operations/"+operationId,retryable:true,updatedAt:"2026-09-01T00:00:00Z"};
function item():CareerRecordListItem {return {...record,categoryKey:"test",isEmpty:false,periodFrom:null,periodTo:null,linkCount:0,usedInCount:0};}
function shell(records:CareerRecord[]=[]){render(<CareerViewShell category={category} initialView={view} initialPage={{data:records,page:{hasNextPage:false,nextCursor:null}}}/>);}
beforeEach(()=>{vi.stubGlobal("crypto",webcrypto);});
afterEach(()=>{cleanup();sessionStorage.clear();vi.unstubAllGlobals();});
it("keeps a create pending until owner completion and permits a fresh identical create afterward",async()=>{
 let finish!:(response:Response)=>void;
 const requests:{key:string|null;body:unknown}[]=[];
 vi.stubGlobal("fetch",vi.fn(async(url:string,init?:RequestInit)=>{
  if(init?.method==="POST"){requests.push({key:new Headers(init.headers).get("idempotency-key"),body:JSON.parse(String(init.body))});return Response.json({data:operation},{status:202});}
  if(url.includes("/write-operations/"))return new Promise<Response>(resolve=>{finish=resolve;});
  return Response.json({data:record});
 }));
 shell();fireEvent.click(screen.getByRole("button",{name:"새로 만들기"}));
 await waitFor(()=>expect(requests).toHaveLength(1));
 expect(screen.queryByRole("gridcell",{name:"123.4500"})).toBeNull();
 await waitFor(()=>expect(screen.getByRole("button",{name:"새로 만들기"})).toHaveProperty("disabled",true));
 finish(Response.json({data:{...operation,state:"completed",retryable:false,owners:{business:"completed",document:"not-required"}}}));
 await waitFor(()=>expect(screen.getByRole("gridcell",{name:"123.4500"})).toBeTruthy());
 fireEvent.click(screen.getByRole("button",{name:"새로 만들기"}));
 await waitFor(()=>expect(requests).toHaveLength(2));
 expect(requests[0]!.body).toEqual(requests[1]!.body);
 expect(requests[0]!.key).not.toBe(requests[1]!.key);
});
it("keeps a table update pending and disables only the affected record until canonical refresh",async()=>{
 let finish!:(response:Response)=>void;
 const requests:unknown[]=[];
 vi.stubGlobal("fetch",vi.fn(async(url:string,init?:RequestInit)=>{
  if(init?.method==="PATCH"){requests.push(JSON.parse(String(init.body)));return Response.json({data:operation},{status:202});}
  if(url.includes("/write-operations/"))return new Promise<Response>(resolve=>{finish=resolve;});
  return Response.json({data:{...record,version:2,propertyValues:[{propertyDefinitionId:propertyId,type:"number",value:"9007199254740993123456789012345678"}]}});
 }));
 shell([record,{...record,id:otherId,title:"다른 기록",propertyValues:[{propertyDefinitionId:propertyId,type:"number",value:"2.00"}]}]);
 const cell=screen.getByRole("gridcell",{name:"123.4500"});fireEvent.focus(cell);fireEvent.keyDown(cell,{key:"F2"});
 const input=screen.getByLabelText("정밀값 셀 편집");fireEvent.change(input,{target:{value:"9007199254740993123456789012345678"}});fireEvent.keyDown(input,{key:"Enter"});
 await waitFor(()=>expect(requests).toHaveLength(1));
 await waitFor(()=>expect(screen.getByRole("gridcell",{name:"9007199254740993123456789012345678"})).toHaveProperty("ariaReadOnly","true"));
 expect(screen.getByRole("gridcell",{name:"2.00"})).toHaveProperty("ariaReadOnly","false");
 finish(Response.json({data:{...operation,state:"completed",retryable:false,owners:{business:"completed",document:"not-required"}}}));
 await waitFor(()=>expect(screen.getByRole("gridcell",{name:"9007199254740993123456789012345678"})).toHaveProperty("ariaReadOnly","false"));
 expect(requests).toHaveLength(1);
});
it("keeps PropertyList pending without interpreting the operation as a record",async()=>{
 let finish!:(response:Response)=>void;
 const requests:unknown[]=[];
 vi.stubGlobal("fetch",vi.fn(async(url:string,init?:RequestInit)=>{
  if(init?.method==="PATCH"){requests.push(JSON.parse(String(init.body)));return Response.json({data:operation},{status:202});}
  if(url.includes("/write-operations/"))return new Promise<Response>(resolve=>{finish=resolve;});
  return Response.json({data:{...record,version:2,propertyValues:[{propertyDefinitionId:propertyId,type:"number",value:"456.7800"}]}});
 }));
 render(<PropertyList record={item()} definitions={[definition]} categoryId={id}/>);
 const input=screen.getByLabelText("정밀값");fireEvent.change(input,{target:{value:"456.7800"}});fireEvent.keyDown(input,{key:"Enter"});
 await waitFor(()=>expect(requests).toHaveLength(1));
 await waitFor(()=>expect(screen.getByLabelText("제목")).toHaveProperty("disabled",true));
 expect(screen.getByText("변경 적용 중입니다.")).toBeTruthy();
 finish(Response.json({data:{...operation,state:"completed",retryable:false,owners:{business:"completed",document:"not-required"}}}));
 await waitFor(()=>expect((screen.getByLabelText("정밀값") as HTMLInputElement).value).toBe("456.7800"));
 expect(screen.getByLabelText("제목")).toHaveProperty("disabled",false);
 expect(requests).toHaveLength(1);
});
it("resumes a stored pending record reference using status reads only",async()=>{
 sessionStorage.setItem("ex-career-write:v1:career-record:"+id+":update:operation",operationId);
 const requests:{url:string;method:string|undefined}[]=[];
 vi.stubGlobal("fetch",vi.fn(async(url:string,init?:RequestInit)=>{
  requests.push({url,method:init?.method});
  return url.includes("/write-operations/")?Response.json({data:{...operation,state:"completed",retryable:false,owners:{business:"completed",document:"not-required"}}}):Response.json({data:{...record,version:2,propertyValues:[{propertyDefinitionId:propertyId,type:"number",value:"5.00"}]}});
 }));
 render(<PropertyList record={item()} definitions={[definition]} categoryId={id}/>);
 await waitFor(()=>expect((screen.getByLabelText("정밀값") as HTMLInputElement).value).toBe("5.00"));
 expect(requests.map(value=>value.url)).toEqual(["/api/career/write-operations/"+operationId,"/api/career/records/"+id]);
 expect(requests.every(value=>!value.method)).toBe(true);
});

it("replays the original table request after a lost response even when the rollback read has advanced",async()=>{
 const requests:{key:string|null;version:string|null;body:string}[]=[];
 vi.stubGlobal("fetch",vi.fn(async(_url:string,init?:RequestInit)=>{
  if(init?.method==="PATCH"){
   const headers=new Headers(init.headers);requests.push({key:headers.get("idempotency-key"),version:headers.get("if-match"),body:String(init.body)});
   if(requests.length===1)throw new TypeError("lost response");
   return Response.json({data:{...record,version:2,propertyValues:[{propertyDefinitionId:propertyId,type:"number",value:"456.7800"}]}});
  }
  return Response.json({data:{...record,version:2}});
 }));
 shell([record]);
 const cell=screen.getByRole("gridcell",{name:"123.4500"});fireEvent.focus(cell);fireEvent.keyDown(cell,{key:"F2"});
 const input=screen.getByLabelText("정밀값 셀 편집");fireEvent.change(input,{target:{value:"456.7800"}});fireEvent.keyDown(input,{key:"Enter"});
 await waitFor(()=>expect(screen.getByRole("gridcell",{name:"123.4500"}).getAttribute("data-issue")).toBe("true"));
 fireEvent.contextMenu(screen.getByRole("gridcell",{name:"123.4500"}));
 fireEvent.click(screen.getByRole("menuitem",{name:"다시 저장"}));
 await waitFor(()=>expect(requests).toHaveLength(2));
 expect(requests[1]).toEqual(requests[0]);
});
it("preserves exact canonical scalar, relation and body inputs when duplicate creation is pending",async()=>{
 const targetId="00000000-0000-4000-8000-000000000005", relationId="00000000-0000-4000-8000-000000000006";
 const relation={...definition,id:relationId,key:"related",name:"관계",type:"relation" as const,config:{targetCategoryId:id}};
 const source={...record,properties:{related:{type:"relation" as const,value:[{recordId:targetId,title:"연결"}]}}};
 const requests:unknown[]=[];
 vi.stubGlobal("fetch",vi.fn(async(_url:string,init?:RequestInit)=>{
  if(init?.method==="POST"){requests.push(JSON.parse(String(init.body)));return Response.json({data:operation},{status:202});}
  return new Promise<Response>(()=>{});
 }));
 render(<CareerViewShell category={{...category,propertySchemaV2:[definition,relation]}} initialView={view} initialPage={{data:[source],page:{hasNextPage:false,nextCursor:null}}}/>);
 fireEvent.contextMenu(screen.getByRole("gridcell",{name:"123.4500"}));fireEvent.click(screen.getByRole("menuitem",{name:"기록 복제"}));
 await waitFor(()=>expect(requests).toEqual([{categoryId:id,title:"원본 복제",propertyValues:record.propertyValues,bodyMd:"live",initialRelations:[{propertyId:relationId,targetIds:[targetId]}]}]));
 await screen.findByText("변경 적용 중입니다.");
 expect(screen.getAllByRole("gridcell",{name:"123.4500"})).toHaveLength(1);
});

it("shows terminal create recovery explicitly and never retries a successful owner automatically",async()=>{
 const terminal={...operation,state:"recovery-required",retryable:false};
 const fetcher=vi.fn(async(_url:string,init?:RequestInit)=>init?.method==="POST"?Response.json({error:{code:"CONFLICT",message:"Conflict",requestId:id,details:{operation:terminal}}},{status:409}):Response.json({data:terminal}));
 vi.stubGlobal("fetch",fetcher);shell();fireEvent.click(screen.getByRole("button",{name:"새로 만들기"}));
 expect((await screen.findByRole("alert")).textContent).toContain("복구 확인");
 expect(screen.getByRole("button",{name:"새로 만들기"})).toHaveProperty("disabled",true);
 expect(screen.queryByRole("gridcell",{name:"123.4500"})).toBeNull();
 expect(fetcher.mock.calls.filter(([,init])=>init?.method==="POST")).toHaveLength(1);
});

it("preserves table new-row focus when creation completes asynchronously",async()=>{
 let finish!:(response:Response)=>void;
 vi.stubGlobal("fetch",vi.fn(async(url:string,init?:RequestInit)=>{
  if(init?.method==="POST")return Response.json({data:{...operation,recordId:otherId}},{status:202});
  if(url.includes("/write-operations/"))return new Promise<Response>(resolve=>{finish=resolve;});
  return Response.json({data:{...record,id:otherId,title:"",propertyValues:[]}});
 }));
 shell([record]);fireEvent.click(screen.getByRole("button",{name:"원본 아래에 새 기록"}));
 await screen.findByText("변경 적용 중입니다.");
 expect(screen.queryByRole("textbox",{name:"제목 셀 편집"})).toBeNull();
 finish(Response.json({data:{...operation,recordId:otherId,state:"completed",retryable:false,owners:{business:"completed",document:"not-required"}}}));
 expect(await screen.findByRole("textbox",{name:"제목 셀 편집"})).toBeTruthy();
});

it("adopts a stored reference after hydration without replacing the server-rendered property tree",async()=>{
 const storage=sessionStorage;
 storage.setItem("ex-career-write:v1:career-record:"+id+":update:operation",operationId);
 vi.stubGlobal("fetch",vi.fn(async()=>new Promise<Response>(()=>{})));
 vi.stubGlobal("sessionStorage",undefined);
 const markup=renderToString(<PropertyList record={item()} definitions={[definition]} categoryId={id}/>);
 vi.stubGlobal("sessionStorage",storage);
 const container=document.createElement("div");container.innerHTML=markup;document.body.append(container);
 const node=container.firstChild, errors=vi.fn();
 let root:ReturnType<typeof hydrateRoot>;
 await act(async()=>{root=hydrateRoot(container,<PropertyList record={item()} definitions={[definition]} categoryId={id}/>,{onRecoverableError:errors});});
 await waitFor(()=>expect(screen.getByText("변경 적용 중입니다.")).toBeTruthy());
 expect(container.firstChild).toBe(node);
 expect(errors).not.toHaveBeenCalled();
 await act(async()=>root.unmount());container.remove();
});
