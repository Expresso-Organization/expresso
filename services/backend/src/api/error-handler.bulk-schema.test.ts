import Fastify from "fastify";
import {randomUUID} from "node:crypto";
import {describe,expect,it} from "vitest";
import {ApiErrorResponseSchema} from "@expresso/contracts";
import {registerErrorHandler} from "./error-handler.js";
describe("unsupported bulk schema compatibility error",()=>{
 it("publishes only the explicit supported bulk code and safe instructions",async()=>{
  const app=Fastify({logger:false,genReqId:()=>randomUUID()});registerErrorHandler(app);
  app.patch("/bulk",async()=>{throw Object.assign(new Error("private detail must stay private"),{statusCode:409,publicErrorCode:"BULK_SCHEMA_CHANGE_UNSUPPORTED",publicDetails:{supportedOperations:{preview:"/preview",apply:"/apply",restore:"/restore"}}});});
  app.get("/other",async()=>{throw Object.assign(new Error("private failure"),{statusCode:409,publicErrorCode:"OTHER_UNSAFE_CODE"});});
  try{const response=await app.inject({method:"PATCH",url:"/bulk"});expect(response.statusCode).toBe(409);const result=ApiErrorResponseSchema.parse(response.json());expect(result.error).toMatchObject({code:"BULK_SCHEMA_CHANGE_UNSUPPORTED",details:{supportedOperations:{preview:"/preview",apply:"/apply",restore:"/restore"}}});expect(result.error.message).toContain("preview/apply/restore");expect(response.body).not.toContain("private detail");expect((await app.inject("/other")).json().error.code).toBe("CONFLICT");}finally{await app.close();}
 });
});