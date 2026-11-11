import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { ScriptedAiClient } from "../../platform/ai/scripted-client.js";
import { AiSentenceWriter, type WriterContext } from "./writer.js";
const context: WriterContext={userId:null,sections:[{recipeSectionId:randomUUID(),title:"API",purpose:"역할",targetLength:300,goal:"역할",points:[],metrics:[],tone:"담백함",format:"narrative",exclude:[],items:[{pointText:"조회 API",sourceNumbers:[1]}]}],evidence:[{id:randomUUID(),sourceType:"record",label:"조회 API",text:"조회 API를 구현했다."}],company:null,jobTitle:null,lockedTexts:[]};
function client(verdict:string){return new ScriptedAiClient(spec=>spec.contract==="generation"?{blocks:[{section:1,kind:"paragraph",text:"조회 API를 구현했다.",sources:[1]}]}:{items:[{blockIndex:0,verdict,reason:"근거 대조"}]});}
it("calls semantic review after generation when enabled by the Worker",async()=>{const ai=client("supported");expect((await new AiSentenceWriter(ai,true).write(context)).blocks).toHaveLength(1);expect(ai.calls.map(call=>call.contract)).toEqual(["generation","career_claim_review"]);});
it("does not return generated output when semantic review is uncertain",async()=>{await expect(new AiSentenceWriter(client("uncertain"),true).write(context)).rejects.toThrow();});
