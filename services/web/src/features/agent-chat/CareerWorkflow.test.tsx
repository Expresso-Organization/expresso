// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import CareerWorkflow from "./CareerWorkflow";
import { loadCareerWorkflows, createCareerWorkflow, decideCareerWorkflow } from "./workflow-actions";
vi.mock("./workflow-actions",()=>({loadCareerWorkflows:vi.fn(),createCareerWorkflow:vi.fn(),reviewCareerWorkflow:vi.fn(),decideCareerWorkflow:vi.fn()}));
afterEach(()=>{cleanup();vi.clearAllMocks();});
const id="00000000-0000-4000-8000-000000000001";
it("shows saved-state errors near the controls",async()=>{
 vi.mocked(loadCareerWorkflows).mockResolvedValue({ok:false,error:"접근 권한을 확인하세요."});
 render(<CareerWorkflow conversationId={id} lastUserText="" disabled={false} onSend={()=>{}} />);
 expect(await screen.findByRole("alert")).toHaveProperty("textContent","접근 권한을 확인하세요.");
});
it("requires an explicit create click and passes only selected records",async()=>{
 vi.mocked(loadCareerWorkflows).mockResolvedValue({ok:true,runs:[],options:[{id,title:"내 기록",status:"organized"}]});
 vi.mocked(createCareerWorkflow).mockResolvedValue({ok:false,error:"테스트 안내"});
 render(<CareerWorkflow conversationId={id} lastUserText="공고와 경력을 비교해줘" disabled={false} onSend={()=>{}} />);
 await screen.findByText("내 기록");expect(createCareerWorkflow).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole("checkbox"));fireEvent.click(screen.getByText("작업 계획 확인"));
 await waitFor(()=>expect(createCareerWorkflow).toHaveBeenCalled());
 expect(vi.mocked(createCareerWorkflow).mock.calls[0]![1].recordIds).toEqual([id]);expect(decideCareerWorkflow).not.toHaveBeenCalled();
});
it("copies a recent request without executing it",async()=>{
 vi.mocked(loadCareerWorkflows).mockResolvedValue({ok:true,runs:[],options:[]});
 render(<CareerWorkflow conversationId={id} lastUserText="공고와 경력을 비교해줘" disabled={false} onSend={()=>{}} />);
 await waitFor(()=>expect(screen.queryByRole("status")).toBeNull());
 fireEvent.click(screen.getByText("최근 내 요청 가져오기"));
 expect(screen.getByDisplayValue("공고와 경력을 비교해줘")).toBeTruthy();expect(createCareerWorkflow).not.toHaveBeenCalled();
});
it("disables final handoff after a reviewed claim is edited",async()=>{
 const run={id,conversationId:id,requestId:id,version:3,intent:"portfolio" as const,status:"waiting_for_approval" as const,requestText:"포트폴리오",reasonCodes:[],question:null,sourceFingerprint:"a".repeat(64),job:{id,title:"공고"},records:[{id,title:"내 기록",version:1,status:"organized",text:"조회 API를 구현했다.",textHash:"a",truncated:false}],gap:null,steps:[],claims:[{id,text:"조회 API를 구현했다.",sources:[{recordId:id,quote:"조회 API를 구현했다."}]}],review:{mode:"exact" as const,items:[{claimId:id,status:"supported" as const,reason:"원문 그대로"}],reviewedAt:"2026-10-29T00:00:00.000Z"},brewId:id,nextPath:null,createdAt:"2026-10-29T00:00:00.000Z",updatedAt:"2026-10-29T00:00:00.000Z"};
 vi.mocked(loadCareerWorkflows).mockResolvedValue({ok:true,runs:[run],options:[]});
 render(<CareerWorkflow conversationId={id} lastUserText="" disabled={false} onSend={()=>{}} />);
 const button=await screen.findByText("검토한 근거 확인·제작 연결");expect((button as HTMLButtonElement).disabled).toBe(false);
 fireEvent.change(screen.getByLabelText("사용할 문장"),{target:{value:"팀원의 역할까지 직접 구현했다."}});
 expect((button as HTMLButtonElement).disabled).toBe(true);expect(decideCareerWorkflow).not.toHaveBeenCalled();
});
