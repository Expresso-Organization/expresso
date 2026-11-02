import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { CareerWorkflow, WorkflowClaim } from "@expresso/contracts";
import { WorkflowInputSchema } from "@expresso/contracts";
import { routeWorkflow } from "./router.js";
import { exactClaim, reviewClaims, validateClaimSources } from "./claim-review.js";
import { ScriptedAiClient } from "../../platform/ai/scripted-client.js";
const recordId = randomUUID();
const records: CareerWorkflow["records"] = [{ id: recordId, title: "테스트", version: 1, status: "organized", text: "데이터 구조는 팀원이 정했고, 나는 조회 API를 구현했다.\nJava 경험은 없다.", textHash: "x", truncated: false }];
const claim = (text: string, quote = text): WorkflowClaim => ({ id: randomUUID(), text, sources: [{ recordId, quote }] });
describe("request routing",()=>{
 it.each([["이 공고로 포트폴리오를 만들고 싶어","portfolio"],["공고와 기록을 비교해줘","match"],["추가 질문을 해줘","interview"],["부족 역량을 정리해줘","gap"],["준비 계획을 만들어줘","preparation"],["경력을 정리해줘","record"]] as const)("routes %s",(text,intent)=>expect(routeWorkflow(text).intent).toBe(intent));
 it("asks for a choice for multiple intents",()=>expect(routeWorkflow("포트폴리오와 준비 계획을 만들어줘").reasons).toContain("AMBIGUOUS_INTENT"));
 it("lets a user choose the intended task",()=>expect(routeWorkflow("포트폴리오와 준비 계획", "portfolio").intent).toBe("portfolio"));
 it("does not authorize unsupported writes through an explicit intent",()=>expect(routeWorkflow("자동 배포해줘", "portfolio").intent).toBe("unknown"));
 it("rejects duplicate selected records",()=>expect(WorkflowInputSchema.safeParse({requestId:randomUUID(),text:"포트폴리오",recordIds:[recordId,recordId]}).success).toBe(false));
});
describe("claim grounding",()=>{
 it("accepts a complete unchanged source line",()=>expect(exactClaim(claim("Java 경험은 없다."),records)).toBe(true));
 it("does not accept cutting a negative sentence",()=>expect(exactClaim(claim("Java 경험", "Java 경험"),records)).toBe(false));
 it("rejects a foreign source",()=>expect(()=>validateClaimSources([{...claim("Java 경험은 없다."),sources:[{recordId:randomUUID(),quote:"Java 경험은 없다."}]}],records)).toThrow());
 it("rejects a fabricated quote",()=>expect(()=>validateClaimSources([claim("직접 설계했다.")],records)).toThrow());
 it("checks exact source without any provider",async()=>expect((await reviewClaims(null,[claim("Java 경험은 없다.")],records,randomUUID())).items[0]?.status).toBe("supported"));
 it("keeps a paraphrase uncertain when provider is disabled",async()=>expect((await reviewClaims(null,[claim("Java 개발 경험이 없다.","Java 경험은 없다.")],records,randomUUID())).items[0]?.status).toBe("uncertain"));
 it("preserves a contradictory model verdict",async()=>{const c=claim("Java로 개발했다.","Java 경험은 없다.");const ai=new ScriptedAiClient(()=>({items:[{claimId:c.id,status:"contradicted",reason:"부정 발언을 긍정으로 바꿨습니다."}]}));expect((await reviewClaims(ai,[c],records,randomUUID())).items[0]?.status).toBe("contradicted");});
 it("rejects an AI verdict for another claim",async()=>{const c=claim("직접 조회 기능을 개발했다.","나는 조회 API를 구현했다.");const ai=new ScriptedAiClient(()=>({items:[{claimId:randomUUID(),status:"supported",reason:"다른 항목"}]}));await expect(reviewClaims(ai,[c],records,randomUUID())).rejects.toMatchObject({statusCode:422});});
});
