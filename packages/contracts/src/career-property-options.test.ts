import { describe,expect,it } from "vitest";
import * as api from "./index.js";
describe("private freeform Career option contract",()=>{
 it("preserves exact raw label and accepts no caller-supplied owner",()=>{
  const schema=(api as unknown as {CareerRegisterPropertyOptionSchema?:{parse(input:unknown):unknown;safeParse(input:unknown):{success:boolean}}}).CareerRegisterPropertyOptionSchema;
  expect(schema).toBeDefined();
  expect(schema!.parse({label:"  Tag 원문 😀  "})).toEqual({label:"  Tag 원문 😀  "});
  expect(schema!.safeParse({label:"tag",userId:"00000000-0000-4000-8000-000000000001"}).success).toBe(false);
  expect(schema!.safeParse({label:"a".repeat(201)}).success).toBe(false);
 });
 it("returns an immutable option ID without owner or secret metadata",()=>{
  const schema=(api as unknown as {CareerPropertyOptionResponseSchema?:{parse(input:unknown):unknown;safeParse(input:unknown):{success:boolean}}}).CareerPropertyOptionResponseSchema;
  expect(schema).toBeDefined();
  const value={data:{id:"00000000-0000-4000-8000-000000000001",name:" raw tag "},version:1};
  expect(schema!.parse(value)).toEqual(value);
  expect(schema!.safeParse({...value,userId:value.data.id}).success).toBe(false);
 });
});
