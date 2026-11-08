import { describe,it,expect } from "vitest";
import { CoachingExploreSchema,CoachingDecisionSchema,CoachingFeedbackInputSchema } from "./career-coaching.js";
describe("직무 탐색 계약",()=>{
 it("빈 경험과 잘못된 시간은 거절한다",()=>{expect(CoachingExploreSchema.safeParse({expectedVersion:0,profile:{experience:"",interests:"서버",constraints:"",weeklyHours:0}}).success).toBe(false);});
 it("승인 명령은 알려진 값만 받는다",()=>expect(CoachingDecisionSchema.safeParse({expectedVersion:1,id:crypto.randomUUID(),decision:"publish"}).success).toBe(false));
 it("피드백 이유가 없으면 저장하지 않는다",()=>expect(CoachingFeedbackInputSchema.safeParse({expectedVersion:0,feedback:{id:crypto.randomUUID(),kind:"condition",target:"야근",reason:"",active:true}}).success).toBe(false));
});
