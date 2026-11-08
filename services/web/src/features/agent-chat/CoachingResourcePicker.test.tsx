// @vitest-environment jsdom
import { cleanup,fireEvent,render,screen } from "@testing-library/react";
import { afterEach,it,expect,vi } from "vitest";
import CoachingResourcePicker from "./CoachingResourcePicker";
vi.mock("@/components/ui/button",()=>({Button:({variant:_variant,...p}:React.ButtonHTMLAttributes<HTMLButtonElement>&{variant?:string})=><button {...p}/> }));
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it("선택 목록을 열기 전에는 자료를 조회하지 않는다",()=>{const fetch=vi.fn();vi.stubGlobal('fetch',fetch);render(<CoachingResourcePicker kind="jobs" disabled={false} onSelect={vi.fn()}/>);expect(fetch).not.toHaveBeenCalled();});
it("인증된 자료 목록 조회 실패를 알린다",async()=>{vi.stubGlobal('fetch',vi.fn(async()=>({ok:false})));render(<CoachingResourcePicker kind="portfolios" disabled={false} onSelect={vi.fn()}/>);fireEvent.click(screen.getByRole('button',{name:'내 포트폴리오에서 선택'}));expect((await screen.findByRole('alert')).textContent).toContain('목록을 불러오지 못했습니다');});
