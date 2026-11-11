import { expect, it } from "vitest";
import { ScriptedAiClient } from "./scripted-client.js";
import { verifyGeneratedGrounding } from "./grounding-review.js";
const blocks=[{text:"조회 API를 구현했다.",sources:[{type:"record",text:"직접 조회 API를 구현했다."}]}];
it("accepts one supported verdict for each block",async()=>{const ai=new ScriptedAiClient(()=>({items:[{blockIndex:0,verdict:"supported",reason:"직접 근거"}]}));await expect(verifyGeneratedGrounding(ai,blocks,null)).resolves.toBeUndefined();expect(ai.calls[0]!.contract).toBe("career_claim_review");});
it.each(["contradicted","uncertain"])("blocks %s generation",async(verdict)=>{const ai=new ScriptedAiClient(()=>({items:[{blockIndex:0,verdict,reason:"근거 부족"}]}));await expect(verifyGeneratedGrounding(ai,blocks,null)).rejects.toThrow();});
it("rejects a different block index",async()=>{const ai=new ScriptedAiClient(()=>({items:[{blockIndex:1,verdict:"supported",reason:"다른 번호"}]}));await expect(verifyGeneratedGrounding(ai,blocks,null)).rejects.toThrow();});
it("does not call AI for oversized evidence",async()=>{const ai=new ScriptedAiClient(()=>({items:[]}));await expect(verifyGeneratedGrounding(ai,[{text:"x".repeat(120001),sources:[]}],null)).rejects.toThrow();expect(ai.calls).toHaveLength(0);});
