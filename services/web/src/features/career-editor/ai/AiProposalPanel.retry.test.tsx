// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {afterEach,expect,it,vi} from "vitest";
import {AiProposalPanel} from "./AiProposalPanel";

const id="00000000-0000-4000-8000-000000000001",block="00000000-0000-4000-8000-000000000002";
const proposal={proposalId:id,recordId:id,baseDocumentVersion:3,selection:{blockIds:[block]},summary:"Mixed retry proposal",commands:[{type:"setText",blockId:block,text:"first"},{type:"setText",blockId:block,text:"second"}],propertyChanges:[{propertyId:id,previousValue:null,nextValue:{type:"text",value:"changed"}}],createdAt:"2026-10-30T00:00:00Z",expiresAt:"2027-10-30T00:00:00Z",status:"ready",progress:null,appliedDocumentVersion:null,revisionId:null};
const applied={...proposal,status:"applied",appliedDocumentVersion:5,undoScope:"document",businessChangesRetained:false};
const frozenKey="ex-career-ai-apply:v1:"+id+":"+id;
const rejection={recordId:id,proposalId:id,state:"not-prepared"};
const operation={operationId:block,producer:"ai-proposal",state:"pending",recordId:id,owners:{business:"pending",document:"pending"},statusUrl:"/v1/career/write-operations/"+block,retryable:true,updatedAt:"2026-10-30T00:00:00Z"};
const conflict=(details:unknown={},status=409)=>Response.json({error:{code:status===412?"PRECONDITION_FAILED":"CONFLICT",message:"Conflict",requestId:id,details}},{status});
type Sent={body:string;key:string|null};
const sent=(init?:RequestInit):Sent=>({body:String(init?.body),key:new Headers(init?.headers).get("idempotency-key")});
function mount(version=3){return render(<AiProposalPanel recordId={id} documentVersion={version} announcedProposal={{proposalId:id,baseDocumentVersion:3,status:"ready"}}/>);}
function chooseBodyOnly(){const checks=screen.getAllByRole("checkbox");fireEvent.click(checks[0]!);fireEvent.click(checks[2]!);}
afterEach(()=>{cleanup();vi.unstubAllGlobals();sessionStorage.clear();});

it("does not let an old rejection clear a newer replay after leaving and returning to a Record",async()=>{
 const other="00000000-0000-4000-8000-000000000003",requests:Sent[]=[];
 let rejectOld!:(value:Response)=>void,loseReplay!:(error:Error)=>void;
 vi.stubGlobal("fetch",vi.fn(async(url:string,init?:RequestInit)=>{
  if(url.endsWith("/apply")){
   requests.push(sent(init));if(requests.length===1)return new Promise<Response>(resolve=>{rejectOld=resolve;});
   if(requests.length===2)return new Promise<Response>((_resolve,reject)=>{loseReplay=reject;});
   return Response.json({data:applied});
  }
  return Response.json({data:url.includes(other)?{...proposal,recordId:other,proposalId:other,summary:"Other record"}:proposal});
 }));
 const panel=mount();await screen.findByText(proposal.summary);fireEvent.click(screen.getByRole("button",{name:/개 변경 적용/}));await waitFor(()=>expect(requests).toHaveLength(1));
 panel.rerender(<AiProposalPanel recordId={other} documentVersion={0} announcedProposal={{proposalId:other,baseDocumentVersion:0,status:"ready"}}/>);await screen.findByText("Other record");
 panel.rerender(<AiProposalPanel recordId={id} documentVersion={4} announcedProposal={{proposalId:id,baseDocumentVersion:3,status:"ready"}}/>);await screen.findByText(proposal.summary);
 fireEvent.click(screen.getByRole("button",{name:/개 변경 적용/}));await waitFor(()=>expect(requests).toHaveLength(2));
 await act(async()=>rejectOld(conflict({aiApplyRejection:rejection})));
 expect(sessionStorage.getItem(frozenKey)).not.toBeNull();
 await act(async()=>loseReplay(new TypeError("new replay response lost")));await screen.findByRole("alert");
 chooseBodyOnly();fireEvent.click(screen.getByRole("button",{name:/개 변경 적용/}));await screen.findByRole("button",{name:"본문 변경 되돌리기"});
 expect(requests[1]).toEqual(requests[0]);expect(requests[2]).toEqual(requests[1]);
});

it("releases a proven pre-prepare rejection and sends changed selection, current version and a new key",async()=>{
 const requests:Sent[]=[];
 vi.stubGlobal("fetch",vi.fn(async(url:string,init?:RequestInit)=>{
  if(url.endsWith("/apply")){requests.push(sent(init));return requests.length===1?conflict({aiApplyRejection:rejection}):Response.json({data:applied});}
  return Response.json({data:proposal});
 }));
 const panel=mount();await screen.findByText(proposal.summary);
 fireEvent.click(screen.getByRole("button",{name:/개 변경 적용/}));await screen.findByRole("alert");
 expect(sessionStorage.getItem(frozenKey)).toBeNull();
 chooseBodyOnly();panel.rerender(<AiProposalPanel recordId={id} documentVersion={4} announcedProposal={{proposalId:id,baseDocumentVersion:3,status:"ready"}}/>);
 fireEvent.click(screen.getByRole("button",{name:/개 변경 적용/}));await screen.findByRole("button",{name:"본문 변경 되돌리기"});
 expect(JSON.parse(requests[0]!.body)).toEqual({expectedDocumentVersion:3,commandIndexes:[0,1],propertyChangeIndexes:[0]});
 expect(JSON.parse(requests[1]!.body)).toEqual({expectedDocumentVersion:4,commandIndexes:[1],propertyChangeIndexes:[]});
 expect(requests[1]!.key).not.toBe(requests[0]!.key);expect(requests[1]!.key).toMatch(/^[a-f0-9-]{36}$/);
});

it.each([409,412,"lost"] as const)("keeps the exact frozen request after ambiguous %s despite selection and version edits",async outcome=>{
 const requests:Sent[]=[];
 vi.stubGlobal("fetch",vi.fn(async(url:string,init?:RequestInit)=>{
  if(url.endsWith("/apply")){requests.push(sent(init));if(requests.length===1){if(outcome==="lost")throw new TypeError("response lost");return conflict({},outcome);}return Response.json({data:applied});}
  return Response.json({data:proposal});
 }));
 const panel=mount();await screen.findByText(proposal.summary);fireEvent.click(screen.getByRole("button",{name:/개 변경 적용/}));await screen.findByRole("alert");
 expect(sessionStorage.getItem(frozenKey)).not.toBeNull();chooseBodyOnly();panel.rerender(<AiProposalPanel recordId={id} documentVersion={4} announcedProposal={{proposalId:id,baseDocumentVersion:3,status:"ready"}}/>);
 fireEvent.click(screen.getByRole("button",{name:/개 변경 적용/}));await screen.findByRole("button",{name:"본문 변경 되돌리기"});
 expect(requests).toHaveLength(2);expect(requests[1]).toEqual(requests[0]);
});

it("tracks an existing owner409 before considering any rejection hint, then recovers completion",async()=>{
 let finish!:(value:Response)=>void,completed=false;const requests:Sent[]=[];
 vi.stubGlobal("fetch",vi.fn(async(url:string,init?:RequestInit)=>{
  if(url.endsWith("/apply")){requests.push(sent(init));return conflict({operation,aiApplyRejection:rejection});}
  if(url.includes("/write-operations/"))return new Promise<Response>(resolve=>{finish=value=>{completed=true;resolve(value);};});
  return Response.json({data:completed?applied:proposal});
 }));
 mount();await screen.findByText(proposal.summary);fireEvent.click(screen.getByRole("button",{name:/개 변경 적용/}));
 await waitFor(()=>expect(finish).toBeTypeOf("function"));expect(screen.queryByRole("button",{name:/개 변경 적용/})).toBeNull();
 expect(sessionStorage.getItem(frozenKey)).not.toBeNull();expect(requests).toHaveLength(1);
 finish(Response.json({data:{...operation,state:"completed",retryable:false,owners:{business:"completed",document:"completed"}}}));
 await screen.findByRole("button",{name:"본문 변경 되돌리기"});expect(sessionStorage.getItem(frozenKey)).toBeNull();expect(requests).toHaveLength(1);
});

it.each(["proposal","record"])("does not reuse an uncertain request after a %s switch",async kind=>{
 const nextId="00000000-0000-4000-8000-000000000003",next={...proposal,proposalId:nextId,recordId:kind==="record"?nextId:id,summary:"Next proposal",createdAt:"2026-10-30T01:00:00Z"};
 const requests:Array<Sent & {url:string}>=[];
 vi.stubGlobal("fetch",vi.fn(async(url:string,init?:RequestInit)=>{
  if(url.endsWith("/apply")){requests.push({...sent(init),url});if(requests.length===1)throw new TypeError("lost response");return Response.json({data:{...next,status:"applied",undoScope:"none",businessChangesRetained:true}});}
  return Response.json({data:url.includes(nextId)?next:proposal});
 }));
 const panel=mount();await screen.findByText(proposal.summary);fireEvent.click(screen.getByRole("button",{name:/개 변경 적용/}));await screen.findByRole("alert");
 panel.rerender(<AiProposalPanel recordId={next.recordId} documentVersion={7} announcedProposal={{proposalId:nextId,baseDocumentVersion:3,status:"ready",createdAt:next.createdAt}}/>);
 await screen.findByText(next.summary);chooseBodyOnly();fireEvent.click(screen.getByRole("button",{name:/개 변경 적용/}));await screen.findByText(/문서 복원 대상이 없습니다/);
 expect(JSON.parse(requests[1]!.body)).toEqual({expectedDocumentVersion:7,commandIndexes:[1],propertyChangeIndexes:[]});expect(requests[1]!.url).toContain(nextId);expect(requests[1]!.key).not.toBe(requests[0]!.key);
 expect(sessionStorage.getItem(frozenKey)).not.toBeNull();
});
