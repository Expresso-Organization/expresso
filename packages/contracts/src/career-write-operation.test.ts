import { randomUUID } from "node:crypto";
import { describe,expect,it } from "vitest";
import { CareerProducerIntentSchema } from "./career-producer.js";
import { CareerWriteOperationResponseSchema } from "./career-write-operation.js";
const operationId=randomUUID(),now=new Date().toISOString();
const status={operationId,producer:"career-product",state:"pending",recordId:null,owners:{business:"pending",document:"pending"},statusUrl:`/v1/career/write-operations/${operationId}`,retryable:true,updatedAt:now};
describe("durable product owner status boundary",()=>{
 it("represents genuine pending and terminal recovery states without leaking credentials or commands",()=>{
  expect(CareerWriteOperationResponseSchema.safeParse({data:status}).success).toBe(true);
  expect(CareerWriteOperationResponseSchema.safeParse({data:{...status,state:"recovery-required",retryable:false}}).success).toBe(true);
  expect(CareerWriteOperationResponseSchema.safeParse({data:{...status,credential:"secret"}}).success).toBe(false);
  expect(CareerWriteOperationResponseSchema.safeParse({data:{...status,statusUrl:"https://foreign.example"}}).success).toBe(false);
 });
 it("requires complete owner receipts for public completion and binds the status URL to its operation",()=>{
  expect(CareerWriteOperationResponseSchema.safeParse({data:{...status,state:"completed",retryable:false}}).success).toBe(false);
  expect(CareerWriteOperationResponseSchema.safeParse({data:{...status,state:"completed",owners:{business:"completed",document:"completed"},retryable:false,recordId:randomUUID()}}).success).toBe(true);
  expect(CareerWriteOperationResponseSchema.safeParse({data:{...status,state:"completed",owners:{business:"completed",document:"completed"},retryable:false,recordId:null}}).success).toBe(false);
  expect(CareerWriteOperationResponseSchema.safeParse({data:{...status,statusUrl:`/v1/career/write-operations/${randomUUID()}`}}).success).toBe(false);
 });
 it("accepts the separate product actor and durable blocked state without allowing body in Spring business",()=>{
  const intent={producer:"career-product",userId:randomUUID(),sourceId:operationId,operationId,fingerprint:"a".repeat(64),business:{kind:"create",expectedCategoryVersion:1,input:{categoryId:randomUUID(),title:"",propertyValues:[]}},document:{kind:"markdown",recordId:null,expectedVersion:0,markdown:"body",summary:"생성"},state:"blocked",leaseToken:null,leaseUntil:null,attempts:1,fence:1,businessResult:null,documentResult:null,lastError:"OWNER_CONFLICT",createdAt:now,updatedAt:now};
  expect(CareerProducerIntentSchema.safeParse(intent).success).toBe(true);
  expect(CareerProducerIntentSchema.safeParse({...intent,business:{...intent.business,input:{...intent.business.input,bodyMd:"forbidden"}}}).success).toBe(false);
 });
});
