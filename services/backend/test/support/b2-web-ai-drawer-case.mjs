import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {CareerRecordResponseSchema,CareerWriteOperationResponseSchema,AiEditProposalDetailSchema} from "@expresso/contracts";

// 제안 입력만 격리 DB에 준비합니다. 업무 값·durable intent·receipt는 모두 실제 owner가 씁니다.
export async function probeWebAiDrawerCompletion({page,collections,category,propertyId,userId,expect,api,checks,gateAi,startWorker}){
 const nextValue="900719925474099312345678901234.5600",aTitle="AI pending A",bTitle="AI untouched B",aBody="A retained live body";
 async function record(title,value,bodyMd){
  const response=await page.request.post("/api/career/records",{headers:{"idempotency-key":randomUUID()},data:{categoryId:category.id,title,bodyMd,propertyValues:[{propertyDefinitionId:propertyId,type:"number",value}]}});
  assert.equal(response.status(),200);return CareerRecordResponseSchema.parse(await response.json()).data;
 }
 const a=await record(aTitle,"1.2300",aBody),b=await record(bTitle,"7.0000","B untouched body");
 const bBefore=await collections.careerRecords.findOne({_id:b.id,userId});
 const bootstrap=(await api("GET","/v1/career/records/"+a.id+"/document")).json;
 const selectedBlock=bootstrap.document.content[0].id;
 const proposalA=AiEditProposalDetailSchema.parse((await api("POST","/v1/career/records/"+a.id+"/ai-proposals",{prompt:"A canonical amount fixture",selection:{blockIds:[selectedBlock]}})).json.data);
 await collections.careerAiProposals.updateOne({_id:proposalA.proposalId,userId,recordId:a.id},{$set:{summary:"A canonical Decimal fixture",propertyChanges:[{propertyId,canonicalPreviousValue:{propertyDefinitionId:propertyId,type:"number",value:"1.2300"},canonicalNextValue:{propertyDefinitionId:propertyId,type:"number",value:nextValue}}]}});
 gateAi(proposalA.proposalId,true);
 await page.reload();const aRow=page.getByRole("row").filter({has:page.getByText(aTitle,{exact:true})}).first();await expect(aRow).toBeVisible();await aRow.getByRole("gridcell").nth(1).click();
 const drawer=page.getByLabel("문서 패널");await expect(drawer.getByText("A canonical Decimal fixture",{exact:true})).toBeVisible();
 const applyPath="/api/career/records/"+a.id+"/ai-proposals/"+proposalA.proposalId+"/apply";
 const applying=page.waitForResponse(response=>response.url().endsWith(applyPath)&&response.request().method()==="POST");
 await drawer.getByRole("button",{name:/개 변경 적용/}).click();const pendingWire=await applying;assert.equal(pendingWire.status(),202);const operation=CareerWriteOperationResponseSchema.parse(await pendingWire.json()).data;
 assert.equal(operation.recordId,a.id);assert.equal(operation.producer,"ai-proposal");assert.equal(operation.owners.business,"pending");
 const storedA=await collections.careerAiProposals.findOne({_id:proposalA.proposalId,userId});assert.equal(storedA.writerIntegration.operationId,operation.operationId);assert.equal(storedA.writerIntegration.state,"retry");
 assert.equal((await collections.careerRecords.findOne({_id:a.id,userId})).propertyValues.find(value=>value.propertyDefinitionId===propertyId).value.toString(),"1.2300");
 const proposalB=AiEditProposalDetailSchema.parse((await api("POST","/v1/career/records/"+a.id+"/ai-proposals",{prompt:"Latest proposal B",selection:{blockIds:[selectedBlock]}})).json.data);
 assert.ok(Date.parse(proposalB.createdAt)>Date.parse(proposalA.createdAt));await expect(drawer.getByText(proposalB.summary,{exact:true})).toBeVisible();
 const aOperationStorage="ex-career-write:v1:ai:"+a.id+":"+proposalA.proposalId+":apply:operation";
 await expect.poll(()=>page.evaluate(key=>sessionStorage.getItem(key),aOperationStorage)).toBe(operation.operationId);
 await drawer.getByRole("button",{name:"닫기",exact:true}).click();
 const bRow=page.getByRole("row").filter({has:page.getByText(bTitle,{exact:true})}).first();await bRow.getByRole("gridcell").nth(1).click();
 await expect(drawer.getByLabel("문서 속성").getByRole("textbox",{name:"Exact amount",exact:true})).toHaveValue("7.0000");
 gateAi(proposalA.proposalId,false);const worker=startWorker();
 await expect.poll(async()=>{
  if(worker.child.exitCode!==null)throw new Error("Worker exited: "+worker.output);
  return (await collections.careerAiProposals.findOne({_id:proposalA.proposalId,userId})).writerIntegration.state;
 },{timeout:60000}).toBe("completed");
 await expect(aRow.getByRole("gridcell",{name:nextValue,exact:true})).toBeVisible();
 await expect(drawer.getByLabel("문서 속성").getByRole("textbox",{name:"Exact amount",exact:true})).toHaveValue("7.0000");
 // 실제 Worker가 B 생성 outbox의 파생 계산 표식을 씁니다. 업무·문서·참조의 나머지 필드는 전부 같아야 합니다.
 const bAfter=await collections.careerRecords.findOne({_id:b.id,userId});
 const {computationVersion:afterComputationVersion,computedAt:afterComputedAt,computedProperties:afterComputed,...bBusinessAfter}=bAfter;
 const {computationVersion:beforeComputationVersion,computedAt:beforeComputedAt,computedProperties:beforeComputed,...bBusinessBefore}=bBefore;
 assert.deepEqual(bBusinessAfter,bBusinessBefore);
 assert.equal(afterComputed?.__expressoComputation?.sourceRecordVersion,bBefore.version);
 assert.deepEqual(Object.keys(afterComputed),["__expressoComputation"]);
 assert.equal(afterComputationVersion,1);assert.ok(afterComputedAt instanceof Date);
 await expect.poll(()=>page.evaluate(key=>sessionStorage.getItem(key),aOperationStorage)).toBe(null);
 await aRow.getByRole("gridcell").nth(1).click({button:"right"});const duplicating=page.waitForResponse(response=>response.url().endsWith("/api/career/records")&&response.request().method()==="POST");
 await page.getByRole("menuitem",{name:"기록 복제",exact:true}).click();const duplicateWire=await duplicating;assert.equal(duplicateWire.status(),200);const duplicate=CareerRecordResponseSchema.parse(await duplicateWire.json()).data;
 assert.equal(duplicate.title,aTitle+" 복제");assert.equal(duplicate.propertyValues.find(value=>value.propertyDefinitionId===propertyId).value,nextValue);assert.ok(duplicate.bodyMd.includes(aBody));
 assert.equal((await collections.careerRecords.findOne({_id:duplicate.id,userId})).propertyValues.find(value=>value.propertyDefinitionId===propertyId).value.toString(),nextValue);
 checks.push("real AI durable202, closed A Drawer with B active, automatic Worker owner completion, fresh A list and exact Decimal/live-body duplication, B untouched");
 assert.equal((await collections.careerAiProposals.findOne({_id:proposalB.proposalId,userId})).status,"ready");
 await page.reload();const replayRow=page.getByRole("row").filter({has:page.getByText(aTitle,{exact:true})}).first();await replayRow.getByRole("gridcell").nth(1).click();
 await expect(drawer.getByText(proposalB.summary,{exact:true})).toBeVisible();await expect(drawer.getByText("A canonical Decimal fixture",{exact:true})).toHaveCount(0);
 await expect(drawer.getByText("문서 복원 대상이 없습니다. 속성 변경은 적용된 상태입니다.",{exact:true})).toHaveCount(0);
 assert.equal((await api("GET","/v1/career/records/"+a.id+"/ai-proposals/"+proposalA.proposalId)).json.data.status,"applied");
 checks.push("actual newest proposal B replay survives late A owner completion while A durable result remains applied");
}