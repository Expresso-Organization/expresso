import { createHmac } from "node:crypto";
import { createServer, type IncomingMessage } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createCareerPropertyMutationCredential, createSpringPropertyMutationHttpTransport } from "./spring-property-mutation-http.js";
const scope={userId:"00000000-0000-4000-8000-000000000002",mutationId:"00000000-0000-4000-8000-000000000003",recordId:"00000000-0000-4000-8000-000000000004",operationFingerprint:"a".repeat(64)};
const key=Buffer.from("disposable-mutation-secret-at-least-32-bytes");
const data={id:scope.recordId,userId:scope.userId,categoryId:scope.mutationId,title:"",status:"draft",propertyValues:[],version:2,updatedAt:"2026-10-09T00:00:00.000Z"};
const {userId,...receipt}=scope;
const read={...receipt,leaseToken:userId};
const commit={...read,expectedVersion:1,propertyValues:{set:[],unsetPropertyIds:[]}};
const closers:Array<()=>Promise<void>>=[];
afterEach(async()=>{for(const close of closers.splice(0))await close();});
async function server(handler:(request:IncomingMessage,body:unknown)=>{body:unknown;etag?:string;status?:number}) {
 const app=createServer(async(req,res)=>{let raw="";for await(const chunk of req)raw+=chunk;const result=handler(req,JSON.parse(raw));res.statusCode=result.status??200;res.setHeader("content-type","application/json");if(result.etag)res.setHeader("etag",result.etag);res.end(JSON.stringify(result.body));});
 await new Promise<void>(resolve=>app.listen(0,"127.0.0.1",resolve));closers.push(()=>new Promise<void>((resolve,reject)=>app.close(error=>error?reject(error):resolve())));
 const address=app.address();if(!address||typeof address==="string")throw new Error("missing test port");return `http://127.0.0.1:${address.port}`;
}
describe("scoped mutation HTTP transport",()=>{
 it("signs dedicated claims with bounded expiry and rejects unsafe policies",()=>{
  const token=createCareerPropertyMutationCredential(scope,key,60000,new Date("2026-10-09T00:00:00Z"));const [prefix,payload,signature]=token.split(".");
  expect(prefix).toBe("exmi");expect(JSON.parse(Buffer.from(payload!,"base64url").toString())).toEqual({...scope,audience:"career-property-mutation",expiresAt:"2026-10-09T00:01:00.000Z"});
  expect(signature).toBe(createHmac("sha256",key).update(payload!).digest("base64url"));
  for(const ttl of [0,-1,300001,NaN,Infinity,1.5])expect(()=>createCareerPropertyMutationCredential(scope,key,ttl)).toThrow();
  expect(()=>createCareerPropertyMutationCredential(scope,new Uint8Array(31))).toThrow();
 });
 it("uses POST scoped requests, preserves JSON null and validates result ETags",async()=>{
  const base=await server((req,body)=>{
   expect(req.method).toBe("POST");expect(req.headers.authorization).toMatch(/^Bearer exmi\./);
   expect(body).not.toHaveProperty("userId");
   if(req.url?.endsWith("/receipt")){expect(body).toEqual(receipt);expect(req.headers["if-match"]).toBeUndefined();return {body:null};}
   if(req.url?.endsWith("/read")){expect(body).toEqual(read);return {body:{data,tombstone:null},etag:'"v2"'};}
   expect(req.url).toBe("/internal/career/property-mutations/commit");expect(body).toEqual(commit);expect(req.headers["if-match"]).toBe('"v1"');return {body:{data,changed:true,replayed:false},etag:'"v2"'};
  });
  const transport=createSpringPropertyMutationHttpTransport(base,(actual)=>{expect(actual).toEqual(scope);return createCareerPropertyMutationCredential(actual,key);});
  expect(await transport.invoke("receipt",userId,receipt)).toBeNull();expect(await transport.invoke("read",userId,read)).toEqual({data,tombstone:null});expect(await transport.invoke("commit",userId,commit)).toMatchObject({changed:true});
 });
 it("rejects cross-record responses and wrong ETags",async()=>{
  for(const result of [{data:{...data,id:userId},tombstone:null},{data,tombstone:null}]) {
   const base=await server(()=>({body:result,etag:'"v1"'}));const transport=createSpringPropertyMutationHttpTransport(base,()=>createCareerPropertyMutationCredential(scope,key));
   await expect(transport.invoke("read",userId,read)).rejects.toThrow(/scope|ETag/);
  }
 });
 it("sanitizes owner and credential failures without reflecting secret content",async()=>{
  const token=createCareerPropertyMutationCredential(scope,key);
  const transport=createSpringPropertyMutationHttpTransport("http://127.0.0.1",()=>token,async()=>{throw new Error(token);});
  await expect(transport.invoke("read",userId,read)).rejects.toMatchObject({message:"Spring mutation response unavailable",statusCode:503});
  const provider=createSpringPropertyMutationHttpTransport("http://127.0.0.1",()=>{throw new Error(token);});
  await expect(provider.invoke("read",userId,read)).rejects.toMatchObject({message:"service credential unavailable",statusCode:401});
  for(const credential of ["exps_"+"A".repeat(43),"expi.payload.signature"])await expect(createSpringPropertyMutationHttpTransport("http://127.0.0.1",()=>credential).invoke("read",userId,read)).rejects.toMatchObject({statusCode:401});
 });
});