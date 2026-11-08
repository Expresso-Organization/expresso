import { describe,expect,it } from "vitest";
import { z } from "zod";
import { structuredModelSchema, type StructuredPortfolioContent } from "@expresso/contracts";
import { canConstrainCodexOutput } from "./codex-output-schema.js";
const json=(schema:z.ZodType)=>z.toJSONSchema(schema,{io:"output"});
describe("Codex 출력 계약 호환성",()=>{
 it("고정된 필수 필드 응답은 강제 출력을 유지한다",()=>expect(canConstrainCodexOutput(json(z.object({title:z.string(),count:z.number()})))).toBe(true));
 it("중첩 elements의 선택 metrics를 필수로 바꾸지 않는다",()=>{
 const schema=json(z.object({spec:z.object({elements:z.object({page:z.object({type:z.literal('Page')}),metrics:z.object({text:z.string()}).optional()})})}));
 const before=JSON.stringify(schema);expect(canConstrainCodexOutput(schema)).toBe(false);expect(JSON.stringify(schema)).toBe(before);
 });
 it("배열 안의 선택 필드도 감지한다",()=>expect(canConstrainCodexOutput(json(z.object({rows:z.array(z.object({note:z.string().optional()}))})))).toBe(false));
 it("동적 키 객체는 강제 출력으로 전달하지 않는다",()=>expect(canConstrainCodexOutput(json(z.object({values:z.record(z.string(),z.string())})))).toBe(false));
 it("nullable이지만 필수인 필드는 선택 필드와 구분한다",()=>expect(canConstrainCodexOutput(json(z.object({name:z.string().nullable()})))).toBe(true));
 it("참조된 스키마 정의 안의 선택 필드도 감지한다",()=>expect(canConstrainCodexOutput({type:'object',properties:{item:{$ref:'#/$defs/item'}},required:['item'],additionalProperties:false,$defs:{item:{type:'object',properties:{text:{type:'string'}},required:[],additionalProperties:false}}})).toBe(false));
 it("실제 페이지 Spec 형식도 strict 강제 출력을 사용하지 않는다",()=>{
 const content:StructuredPortfolioContent={version:1,profile:{name:'테스트',role:'개발자',headline:'API 실습',intro:'테스트',focus:[]},sections:[{id:'test',title:'실습',summary:'가상',body:'본문',pattern:'project',details:[],media:[],sourceIds:[]}],career:[],evidence:[],contact:{label:'테스트 연락 안내',href:'mailto:test@example.invalid'}};
 const schema=structuredModelSchema(content,{intro:[],section:[],guidance:[]});
 expect(canConstrainCodexOutput(json(z.object({spec:schema})))).toBe(false);
 });
});

it("수정 값처럼 종류가 고정되지 않은 칸은 강제 출력하지 않는다",()=>expect(canConstrainCodexOutput(json(z.object({value:z.unknown()})))).toBe(false));
