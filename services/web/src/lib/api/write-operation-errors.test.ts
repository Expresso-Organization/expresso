import { expect, it } from "vitest";
import { forwardWriteOperationError, publicWriteOperationFromError } from "./write-operation-errors";
const id="00000000-0000-4000-8000-000000000001", other="00000000-0000-4000-8000-000000000002";
const operation={operationId:id,producer:"career-product",state:"recovery-required",recordId:id,owners:{business:"completed",document:"pending"},statusUrl:"/v1/career/write-operations/"+id,retryable:false,updatedAt:"2026-10-09T00:00:00Z"};
const error={error:{code:"CONFLICT",message:"Conflict",requestId:id,details:{operation}}};
it("rejects private, foreign-record and producer-mismatched operation error data",async()=>{
 for(const value of [{...operation,recordId:null},{...operation,userId:id},{...operation,recordId:other},{...operation,producer:"ai-proposal"},{...operation,statusUrl:"https://foreign.invalid/status"}]){
  const body={error:{...error.error,details:{operation:value}}};
  expect(publicWriteOperationFromError(body,"career-product",id)).toBeNull();
  const response=await forwardWriteOperationError(Response.json(body,{status:409}),"career-product",id);
  expect(response.status).toBe(409);expect(await response.text()).toBe("");
 }
});
it("strips additional private details from otherwise valid public operation metadata",async()=>{
 const response=await forwardWriteOperationError(Response.json({error:{...error.error,details:{operation,plan:"private",sessionToken:"private"}}},{status:409}),"career-product",id);
 expect(response.status).toBe(409);expect(await response.json()).toEqual(error);expect(response.headers.get("cache-control")).toBe("no-store");
});
