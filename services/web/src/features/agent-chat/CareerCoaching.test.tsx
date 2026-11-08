// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within, act } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { CoachingState } from "@expresso/contracts";
import CareerCoaching from "./CareerCoaching";
const mocks=vi.hoisted(()=>({action:vi.fn()}));
vi.mock("./coaching-actions",()=>({coachingAction:mocks.action}));
vi.mock("./CoachingResourcePicker",()=>({default:({kind,onSelect}:{kind:string;onSelect:(id:string,title:string)=>void})=><button onClick={()=>onSelect(state.improvements[0]!.portfolioId,"테스트 포트폴리오")}>{kind==='portfolios'?'테스트 포트폴리오 선택':'테스트 공고 선택'}</button>}));
vi.mock("@/components/ui/button",()=>({Button:({variant:_variant,...props}:React.ButtonHTMLAttributes<HTMLButtonElement>&{variant?:string})=><button {...props}/> }));
afterEach(()=>{cleanup();vi.resetAllMocks();});
const state:CoachingState={version:1,profile:{experience:"API 구현",interests:"서버",constraints:"서울",weeklyHours:3},feedback:[],candidates:[],appliedFeedback:[],improvements:[{id:crypto.randomUUID(),portfolioId:crypto.randomUUID(),period:"30d",kind:"record",title:"경력 근거 보강 검토",evidence:["방문 50회"],prompt:"경력 기록 보강을 질문해줘.",sourceHash:"hash",status:"pending"}]};
it("초안 승인 전 대화 전달 버튼이 없다",async()=>{mocks.action.mockResolvedValue({ok:true,data:state});const send=vi.fn();render(<CareerCoaching conversationId={crypto.randomUUID()} disabled={false} onSend={send}/>);await screen.findByText("경력 근거 보강 검토");expect(screen.queryByRole("button",{name:"승인한 요청을 대화로 보내기"})).toBeNull();expect(send).not.toHaveBeenCalled();});
it("승인해도 자동 전송하지 않고 사용자가 누를 때만 전달한다",async()=>{mocks.action.mockResolvedValueOnce({ok:true,data:state}).mockResolvedValueOnce({ok:true,data:{...state,version:2,improvements:[{...state.improvements[0],status:"approved"}]}});const send=vi.fn();render(<CareerCoaching conversationId={crypto.randomUUID()} disabled={false} onSend={send}/>);fireEvent.click(await screen.findByRole("button",{name:"이 개선 요청 승인"}));const button=await screen.findByRole("button",{name:"승인한 요청을 대화로 보내기"});expect(send).not.toHaveBeenCalled();fireEvent.click(button);expect(send).toHaveBeenCalledWith(state.improvements[0]!.prompt);});
it("오래된 버전 오류를 보여주며 자동 재승인하지 않는다",async()=>{mocks.action.mockResolvedValueOnce({ok:true,data:state}).mockResolvedValueOnce({ok:false,error:"다른 화면에서 설정이 바뀌었습니다."});render(<CareerCoaching conversationId={crypto.randomUUID()} disabled={false} onSend={vi.fn()}/>);fireEvent.click(await screen.findByRole("button",{name:"이 개선 요청 승인"}));await waitFor(()=>expect(screen.getByRole("alert").textContent).toContain("설정이 바뀌었습니다"));expect(mocks.action).toHaveBeenCalledTimes(2);});

it("초기 조회의 네트워크 오류에서도 다시 불러오기를 제공한다",async()=>{mocks.action.mockRejectedValueOnce(Error("network"));render(<CareerCoaching conversationId={crypto.randomUUID()} disabled={false} onSend={vi.fn()}/>);expect((await screen.findByRole("alert")).textContent).toContain("저장 상태를 불러오지 못했습니다");expect(screen.getByRole("button",{name:"저장 상태 다시 불러오기"}).hasAttribute("disabled")).toBe(false);});

it("미배포 오류를 P18 버튼 바로 아래에 표시한다",async()=>{
 mocks.action.mockResolvedValueOnce({ok:true,data:state}).mockResolvedValueOnce({ok:false,error:"아직 배포 이력이 없는 포트폴리오입니다."});
 render(<CareerCoaching conversationId={crypto.randomUUID()} disabled={false} onSend={vi.fn()}/>);
 await screen.findByText("경력 근거 보강 검토");fireEvent.click(screen.getByRole("button",{name:"테스트 포트폴리오 선택"}));fireEvent.click(screen.getByRole("button",{name:"분석 근거로 개선 초안 만들기"}));
 const area=screen.getByLabelText("방문 분석 요청 결과");expect((await within(area).findByRole("alert")).textContent).toContain("배포 이력이 없는");
 expect(screen.getAllByRole("alert")).toHaveLength(1);
});
it("대기 중에는 처리 상태를 보이고 중복 요청을 보내지 않는다",async()=>{
 let finish!:(result:unknown)=>void;
 mocks.action.mockResolvedValueOnce({ok:true,data:state}).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 render(<CareerCoaching conversationId={crypto.randomUUID()} disabled={false} onSend={vi.fn()}/>);
 await screen.findByText("경력 근거 보강 검토");fireEvent.click(screen.getByRole("button",{name:"테스트 포트폴리오 선택"}));fireEvent.click(screen.getByRole("button",{name:"분석 근거로 개선 초안 만들기"}));
 expect(screen.getByRole("button",{name:"방문 분석 확인 중…"}).hasAttribute("disabled")).toBe(true);
 expect(within(screen.getByLabelText("방문 분석 요청 결과")).getByRole("status").textContent).toContain("방문 집계");
 await act(async()=>{finish({ok:true,data:state});});
 expect(within(screen.getByLabelText("방문 분석 요청 결과")).getByRole("status").textContent).toContain("개선 초안 1개");expect(mocks.action).toHaveBeenCalledTimes(2);
});
