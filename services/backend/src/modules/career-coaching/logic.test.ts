import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import type { AnalyticsDashboard } from "@expresso/contracts";
import { explore, improvementDrafts, dashboardHash, personalization } from "./logic.js";
import { dashboard } from "./test-fixture.js";
const profile={experience:"Node.js로 API를 구현했다.",interests:"서버",constraints:"재택 선호",weeklyHours:3};
describe("P16~P18 근거와 승인 초안",()=>{
 it("실제 입력 단서를 보여주며 적성을 확정하지 않는다",()=>{const rows=explore(profile,[]);expect(rows[0]?.role).toBe("백엔드 개발자");expect(rows.every(r=>r.confidence==="low")).toBe(true);expect(rows[0]?.reasons.join()).toContain("주당 3시간");});
 it("부정 경험은 근거 단서에서 제외한다",()=>{expect(explore({...profile,experience:"React 경험은 없다.",interests:"모르겠다"},[]).find(r=>r.role==="프론트엔드 개발자")?.reasons[0]).not.toContain("react");});
 it("비선호 직무를 제외하고 중지하면 다시 탐색한다",()=>{const f={id:randomUUID(),kind:"condition" as const,target:"백엔드 개발자",reason:"관심 없음",active:true};expect(explore(profile,[f]).some(r=>r.role===f.target)).toBe(false);expect(explore(profile,[{...f,active:false}])[0]?.role).toBe(f.target);});
 it("없는 경험에서 높은 확신도를 만들지 않는다",()=>expect(explore({...profile,experience:"아직 없음",interests:"잘 모름"},[]).every(r=>r.confidence==="low")).toBe(true));
 it("비활성 피드백은 모델에 전달하지 않는다",()=>{const value=personalization({version:0,profile,candidates:[],feedback:[{id:randomUUID(),kind:"plan",target:"일정",reason:"시간 부족",active:false}],appliedFeedback:[],improvements:[]});expect(value.feedback).toEqual([]);});
 it("표본 부족에서는 개선 원인을 추정하지 않는다",()=>{const d=dashboard();d.insight={state:"insufficient_sample",sampleSize:1,minimumSample:30};expect(improvementDrafts(d,[])).toEqual([]);});
 it("미집계 자료로는 초안을 생성하지 않는다",()=>{const d=dashboard();d.coverage.pendingDates=["2026-10-30"];expect(improvementDrafts(d,[])).toEqual([]);});
 it("관측 지표에 연결한 세 초안은 모두 승인 대기다",()=>{const d=dashboard(),rows=improvementDrafts(d,[randomUUID(),randomUUID(),randomUUID()]);expect(rows.map(r=>r.kind)).toEqual(["record","portfolio","preparation"]);expect(rows.every(r=>r.status==="pending" && r.sourceHash===dashboardHash(d))).toBe(true);expect(rows[0]?.prompt).toContain("방문 50회");});
 it("지표와 배포 변경을 승인 지문에 반영한다",()=>{const d=dashboard(),h=dashboardHash(d);d.metrics.visits++;expect(dashboardHash(d)).not.toBe(h);});
});
