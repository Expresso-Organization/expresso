import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createMongoResource } from "../../../backend/src/platform/mongodb.ts";
import { MongoCanonicalCareerPropertySchemaService } from "../../../backend/src/modules/career/canonical-property-schema.ts";
import { CanonicalPropertyMutationWorker } from "../../../backend/src/modules/career/property-mutation.ts";
import { createCareerPropertyMutationCredential, createSpringPropertyMutationHttpTransport } from "../../../backend/src/modules/career/spring-property-mutation-http.ts";
import { createSpringPropertyMutationPort } from "../../../backend/src/modules/career/spring-property-mutation-port.ts";

const resource=createMongoResource(process.env.B2_OPTIONS_MONGO_URL,{databaseName:process.env.B2_OPTIONS_DB});
const userId=process.env.B2_OPTIONS_USER,categoryId=process.env.B2_OPTIONS_CATEGORY,propertyId=process.env.B2_OPTIONS_PROPERTY,endpoint=process.env.B2_OPTIONS_ENDPOINT;
const api=new MongoCanonicalCareerPropertySchemaService(resource,"disposable-preview-secret-at-least-32-bytes");
let phase="registration",lastMutationError=null;
const transport=createSpringPropertyMutationHttpTransport(endpoint,scope=>createCareerPropertyMutationCredential(scope,Buffer.from("disposable-mutation-secret-at-least-32-bytes")),async(url,init)=>{
  const response=await fetch(url,init);
  if(!response.ok)lastMutationError=(await response.clone().json()).error?.message??response.status;
  return response;
});
const worker=new CanonicalPropertyMutationWorker(resource,createSpringPropertyMutationPort(transport));
async function product(method,path,body,status=200,version=null,token=process.env.B2_OPTIONS_TOKEN) {
  const headers={"content-type":"application/json",authorization:"Bearer "+token};
  if(method==="POST")headers["idempotency-key"]="option-lifecycle-"+randomUUID();
  if(version!==null)headers["if-match"]='"v'+version+'"';
  const response=await fetch(endpoint+"/v1/career/records"+path,{method,headers,body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
  const result=await response.json();if(response.status!==status)throw Object.assign(new Error("unexpected product status"),{statusCode:response.status,code:result.error?.message});return result.data;
}
async function apply(change,confirmLossy) {
  const preview=await api.previewChange(userId,categoryId,change);
  await api.applyChange(userId,categoryId,preview.categoryVersion,randomUUID(),{change,previewToken:preview.previewToken,confirmLossy});
  const job=await resource.db.collection("career_property_mutations").findOne({userId,categoryId,active:true});
  assert.ok(job,"schema change must publish a mutation job");
  const snapshot=JSON.parse(job.privateOptionSnapshotJson);
  assert.deepEqual(snapshot,[{categoryId,optionId:option,propertyId,rawLabel:" Own ",userId,version:1}]);
  assert.equal(await worker.run(job._id,job.operationFingerprint),"completed");
  const completed=await resource.db.collection("career_property_mutations").findOne({_id:job._id});
  assert.equal(completed.status,"completed");assert.equal(completed.active,false);
  assert.equal(await resource.db.collection("career_property_mutations").countDocuments({userId,categoryId,active:true}),0);
  return job;
}
let option;
try {
  const scenario=process.argv[2];
  assert.ok(["text","select-patch","select-duplicate","select-move"].includes(scenario));
  option=(await api.registerOption(userId,categoryId,propertyId,{label:" Own "})).data.id;
  const ledgerBefore=await resource.db.collection("career_property_options").find({}).sort({_id:1}).toArray();
  const record=await product("POST","",{categoryId,title:"option record",propertyValues:[{propertyDefinitionId:propertyId,type:"multi_select",value:[option]}]},201);
  if(scenario==="text") {
    phase="text conversion";
    const conversion=await apply({kind:"type-change",propertyId,type:"text",config:{}},true);
    let stored=await resource.db.collection("career_records").findOne({_id:record.id});
    assert.deepEqual(stored.propertyValues,[{propertyDefinitionId:propertyId,type:"text",value:option}]);
    phase="text deletion";
    const deletion=await apply({kind:"delete",propertyId},true);
    assert.equal(deletion.privateOptionSnapshotJson,conversion.privateOptionSnapshotJson);
    assert.equal(deletion.privateOptionSnapshotFingerprint,conversion.privateOptionSnapshotFingerprint);
    stored=await resource.db.collection("career_records").findOne({_id:record.id});
    assert.deepEqual(stored.propertyValues,[]);
    assert.equal(stored.propertyValueTombstones[propertyId].value.value,option);
    phase="normal product patch";
    const patched=await product("PATCH","/"+record.id,{title:"after deletion"},200,stored.version);
    assert.equal(patched.title,"after deletion");assert.equal(patched.version,stored.version+1);
    const category=await resource.db.collection("career_categories").findOne({_id:categoryId});
    assert.deepEqual(category.propertySchemaV2[0].config,{});
    assert.equal(await resource.db.collection("career_property_mutation_receipts").countDocuments({userId,recordId:record.id}),2);
  } else {
    phase="select conversion";
    await apply({kind:"type-change",propertyId,type:"select",config:{legacyFreeformTags:true,options:[]}},false);
    const stored=await resource.db.collection("career_records").findOne({_id:record.id});
    const ownValue={propertyDefinitionId:propertyId,type:"select",value:option};
    assert.deepEqual(stored.propertyValues,[ownValue]);
    phase="foreign SELECT option and session rejection";
    const foreign=await resource.db.collection("career_property_options").findOne({categoryId,propertyId,userId:{$ne:userId}});
    const outboxBefore=await resource.db.collection("outbox_events").countDocuments({});
    const commandsBefore=await resource.db.collection("career_command_idempotency").countDocuments({});
    const foreignValue={...ownValue,value:foreign.optionId};
    await product("PATCH","/"+record.id,{propertyValues:{set:[foreignValue],unsetPropertyIds:[]}},400,stored.version);
    await product("POST","",{categoryId,title:"foreign copy",propertyValues:[foreignValue]},400);
    await product("PATCH","/"+record.id,{title:"foreign owner"},404,stored.version,process.env.B2_OPTIONS_OTHER_TOKEN);
    assert.deepEqual(await resource.db.collection("career_records").findOne({_id:record.id}),stored);
    assert.equal(await resource.db.collection("outbox_events").countDocuments({}),outboxBefore);
    assert.equal(await resource.db.collection("career_command_idempotency").countDocuments({}),commandsBefore);
    phase=scenario;
    if(scenario==="select-patch") {
      const patched=await product("PATCH","/"+record.id,{title:"select patched",propertyValues:{set:[ownValue],unsetPropertyIds:[]}},200,stored.version);
      assert.equal(patched.title,"select patched");assert.equal(patched.version,stored.version+1);assert.deepEqual(patched.propertyValues,[ownValue]);
    } else if(scenario==="select-duplicate") {
      const copied=await product("POST","",{categoryId,title:"select duplicate",propertyValues:[ownValue]},201);
      assert.notEqual(copied.id,record.id);assert.equal(copied.title,"select duplicate");assert.deepEqual(copied.propertyValues,[ownValue]);
    } else {
      const targetCategoryId=process.env.B2_OPTIONS_TARGET_CATEGORY,targetPropertyId=process.env.B2_OPTIONS_TARGET_PROPERTY;
      const preview=await product("POST","/"+record.id+"/move/preview",{targetCategoryId},200,stored.version);
      const moved=await product("POST","/"+record.id+"/move",{targetCategoryId,previewToken:preview.previewToken},200,stored.version);
      assert.equal(moved.categoryId,targetCategoryId);assert.deepEqual(moved.propertyValues,[{propertyDefinitionId:targetPropertyId,type:"select",value:process.env.B2_OPTIONS_TARGET_OPTION}]);
      const target=await resource.db.collection("career_categories").findOne({_id:targetCategoryId});
      assert.deepEqual(target.propertySchemaV2[0].config.options,[]);
    }
    const category=await resource.db.collection("career_categories").findOne({_id:categoryId});
    assert.deepEqual(category.propertySchemaV2[0].config.options,[]);
    assert.equal(await resource.db.collection("career_property_mutation_receipts").countDocuments({userId,recordId:record.id}),1);
  }
  assert.equal(await resource.db.collection("career_property_mutations").countDocuments({active:true}),0);
  assert.deepEqual(await resource.db.collection("career_property_options").find({}).sort({_id:1}).toArray(),ledgerBefore);
  console.log("registered tags lifecycle "+scenario+" verified");
} catch(error) {
  const assertion=error.code==="ERR_ASSERTION"?" actual="+JSON.stringify(error.actual)+" expected="+JSON.stringify(error.expected):"";
  console.error("private option lifecycle failed at "+phase+": "+(lastMutationError??error.code??error.statusCode??error.name)+assertion);
  process.exitCode=1;
} finally {await resource.close();}