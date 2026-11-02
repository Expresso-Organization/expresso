import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createMongoResource } from "../../../backend/src/platform/mongodb.ts";

const resource=createMongoResource(process.env.B2_OPTIONS_MONGO_URL,{databaseName:process.env.B2_OPTIONS_DB});
const userId=process.env.B2_OPTIONS_USER,categoryId=process.env.B2_OPTIONS_CATEGORY,propertyId=process.env.B2_OPTIONS_PROPERTY,endpoint=process.env.B2_OPTIONS_ENDPOINT;
const id=value=>`00000000-0000-4000-8000-${String(value).padStart(12,"0")}`;
async function product(method,path,body,status,version=null) {
  const headers={"content-type":"application/json",authorization:"Bearer "+process.env.B2_OPTIONS_TOKEN};
  if(method==="POST")headers["idempotency-key"]="ordinary-select-"+randomUUID();
  if(version!==null)headers["if-match"]='"v'+version+'"';
  const response=await fetch(endpoint+"/v1/career/records"+path,{method,headers,body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
  const result=await response.json();assert.equal(response.status,status,JSON.stringify(result));return result.data;
}
try {
  const configs=[
    {options:[{id:id(81),color:"blue"},{id:id(82),color:"red"}]},
    {options:[{id:id(81),name:"Same"},{id:id(82),name:"Same"}]},
    {options:[{id:id(81),name:"가".repeat(201)},{id:id(82),label:"나".repeat(201)}]},
    {options:[{id:id(81),label:"wire A",name:"display A"},{id:id(82),label:"wire B",name:"display B"}]},
  ];
  const ledgerBefore=await resource.db.collection("career_property_options").find({}).sort({_id:1}).toArray();
  // 같은 소유자의 다른 속성 행과 다른 소유자의 같은 속성 행은 일반 SELECT를 바꾸지 않습니다.
  await resource.db.collection("career_property_options").insertOne({_id:randomUUID(),userId,categoryId,propertyId:id(901),optionId:id(902),rawLabel:"unrelated",version:1,createdAt:new Date()});
  const ledgerWithUnrelated=await resource.db.collection("career_property_options").find({}).sort({_id:1}).toArray();
  for(const config of configs) {
    await resource.db.collection("career_categories").updateOne({_id:categoryId},{$set:{"propertySchemaV2.0.type":"select","propertySchemaV2.0.config":config}});
    const selected={propertyDefinitionId:propertyId,type:"select",value:id(81)};
    const created=await product("POST","",{categoryId,title:"ordinary SELECT",propertyValues:[selected]},201);
    assert.deepEqual(created.propertyValues,[selected]);
    const second={...selected,value:id(82)};
    const patched=await product("PATCH","/"+created.id,{propertyValues:{set:[second],unsetPropertyIds:[]}},200,created.version);
    assert.deepEqual(patched.propertyValues,[second]);assert.equal(patched.version,created.version+1);
    const stored=await resource.db.collection("career_records").findOne({_id:created.id});
    const commandsBefore=await resource.db.collection("career_command_idempotency").countDocuments({});
    const outboxBefore=await resource.db.collection("outbox_events").countDocuments({});
    const receiptsBefore=await resource.db.collection("career_property_mutation_receipts").countDocuments({});
    const foreign=ledgerBefore.find(row=>row.categoryId===categoryId&&row.propertyId===propertyId&&row.userId!==userId);
    assert.ok(foreign);
    const invalid={...selected,value:foreign.optionId};
    await product("POST","",{categoryId,title:"foreign",propertyValues:[invalid]},400);
    await product("PATCH","/"+created.id,{propertyValues:{set:[invalid],unsetPropertyIds:[]}},400,patched.version);
    assert.deepEqual(await resource.db.collection("career_records").findOne({_id:created.id}),stored);
    assert.equal(await resource.db.collection("career_command_idempotency").countDocuments({}),commandsBefore);
    assert.equal(await resource.db.collection("outbox_events").countDocuments({}),outboxBefore);
    assert.equal(await resource.db.collection("career_property_mutation_receipts").countDocuments({}),receiptsBefore);
    assert.deepEqual((await resource.db.collection("career_categories").findOne({_id:categoryId})).propertySchemaV2[0].config,config);
  }
  assert.deepEqual(await resource.db.collection("career_property_options").find({}).sort({_id:1}).toArray(),ledgerWithUnrelated);
  console.log("ordinary SELECT original options accepted by authenticated Spring create and PATCH without private leakage");
} finally {await resource.close();}