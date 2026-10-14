import { randomUUID } from "node:crypto";
import { Decimal128 } from "mongodb";
import type { CareerBusinessPropertyValue, CareerPropertyDefinitionV2 } from "@expresso/contracts";
import { mongoCollections, registerCareerPropertyOption, type CareerRecordDoc } from "@expresso/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMongoFixture } from "../../../test/support/mongodb.js";
import { MongoIdentityService } from "../identity/index.js";
import { CareerViewService, type CreateCareerViewConfiguration } from "./views.js";
import { mutationCanonicalJson, mutationFingerprint } from "./property-mutation-state.js";

const amount: CareerPropertyDefinitionV2 = { id: randomUUID(), key: "amount", name: "Amount", type: "number", required: false, system: false, config: {}, order: 0, version: 1, deletedAt: null };
const period: CareerPropertyDefinitionV2 = { ...amount, id: randomUUID(), key: "period", name: "Period", type: "date", order: 1 };
const customTime: CareerPropertyDefinitionV2 = { ...period, id: randomUUID(), key: "custom_time", name: "Custom time", type: "created_time", order: 2 };
const tags: CareerPropertyDefinitionV2 = { ...amount, id: randomUUID(), key: "tags", name: "Tags", type: "multi_select", config: { legacyFreeformTags: true, options: [] }, order: 3 };
const formula: CareerPropertyDefinitionV2 = { ...amount, id: randomUUID(), key: "computed", name: "Computed", type: "formula", order: 4 };
const related: CareerPropertyDefinitionV2 = { ...amount, id: randomUUID(), key: "related", name: "Related", type: "relation", order: 6 };
const inverse: CareerPropertyDefinitionV2 = { ...related, id: randomUUID(), key: "back", name: "Back" };
const systemTime: CareerPropertyDefinitionV2 = { ...customTime, id: randomUUID(), key: "updated", name: "Updated", type: "updated_time", system: true, order: 5 };

describe.skipIf(!(process.env.TEST_MONGODB_ADMIN_URL ?? process.env.TEST_MONGODB_URL))("canonical Career views with Mongo", () => {
  let fixture: Awaited<ReturnType<typeof createMongoFixture>>;
  let service: CareerViewService;
  let userId: string;
  let otherUserId: string;
  let categoryId: string;
  let optionId: string;
  let targetCategoryId: string;
  let liveTargetId: string;
  let recordIds: string[];
  const large = ["9007199254740993123456789012345678", "9007199254740993123456789012345679"];
  beforeAll(async () => {
    fixture = await createMongoFixture("b2canonicalviews");
    service = new CareerViewService(fixture.resource);
    const identity = new MongoIdentityService(fixture.resource);
    userId = (await identity.signup({ email: "view-a-" + randomUUID() + "@example.com", displayName: "A", password: "disposable-view-password" })).user.id;
    otherUserId = (await identity.signup({ email: "view-b-" + randomUUID() + "@example.com", displayName: "B", password: "disposable-view-password" })).user.id;
    const db = mongoCollections(fixture.resource.db);
    categoryId = randomUUID();
    targetCategoryId = randomUUID();
    const now = new Date("2026-09-01T00:00:00Z");
    await db.careerCategories.insertOne({ _id: categoryId, userId, key: "b2-views", name: "Canonical", icon: "table", defaultView: "table", isSystem: false, propertySchema: {}, propertySchemaV2: [amount, period, customTime, tags, formula, systemTime, { ...related, config: { targetCategoryId, inversePropertyId: inverse.id, cardinality: "multiple", deletePolicy: "restrict" } }], schemaVersion: 1, version: 1, sortOrder: 0, updatedAt: now });
    optionId = (await registerCareerPropertyOption(fixture.resource.db, { userId, categoryId, propertyId: tags.id }, "  Own private tag  ")).optionId;
    const dates: Array<Extract<CareerBusinessPropertyValue, { type: "date" }>["value"]> = [
      { precision: "month", start: "2026-08", end: null },
      { precision: "day", start: "2026-08-02", end: null },
      { precision: "datetime", start: "2026-09-01T12:00:00.000000002+09:00", end: null, timezone: "Asia/Seoul" },
      { precision: "datetime", start: "2026-09-01T03:00:00.000000001Z", end: null, timezone: "UTC" },
    ];
    // Spring 소유의 정본 상태를 seed하고, 물리 legacy 값은 의도적으로 다르게 둡니다.
    const rows: CareerRecordDoc[] = ["123.4500", ...large, null].map((value, index) => ({
      _id: randomUUID(), userId, categoryId, title: "Canonical " + index, status: "draft", origin: "manual",
      properties: { amount: { type: "number", value: 999 }, period: "2030-01" },
      propertyValues: [
        ...(value === null ? [] : [{ propertyDefinitionId: amount.id, type: "number" as const, value: Decimal128.fromString(value) }]),
        { propertyDefinitionId: period.id, type: "date", value: dates[index]! },
        { propertyDefinitionId: customTime.id, type: "date", value: { precision: "datetime", start: "2026-09-01T03:00:00.00000000" + index + "Z", end: null, timezone: "UTC" } },
        { propertyDefinitionId: tags.id, type: "multi_select", value: [optionId] },
      ],
      computedProperties: { computed: { type: "formula", value: 100 - index, diagnostics: [] } },
      bodyMd: "Original document", version: 1, createdAt: now, updatedAt: new Date(now.getTime() + index), deletedAt: null, purgeAfter: null,
    }));
    await db.careerRecords.insertMany(rows);
    recordIds = rows.map((row) => row._id);
    await db.careerCategories.insertOne({ _id: targetCategoryId, userId, key: "b2-view-targets", name: "Targets", icon: "table", defaultView: "table", isSystem: false, propertySchema: {}, propertySchemaV2: [{ ...inverse, config: { targetCategoryId: categoryId, inversePropertyId: related.id, cardinality: "multiple", deletePolicy: "restrict" } }], schemaVersion: 1, version: 1, sortOrder: 1, updatedAt: now });
    liveTargetId = randomUUID();
    const trashedTargetId = randomUUID();
    const missingTargetId = randomUUID();
    const foreignTargetId = randomUUID();
    await db.careerRecords.insertMany([
      { _id: liveTargetId, userId, categoryId: targetCategoryId, title: "Live target", status: "draft", origin: "manual", properties: { back: { type: "relation", value: [] } }, propertyValues: [], bodyMd: "", version: 1, updatedAt: now, deletedAt: null },
      { _id: trashedTargetId, userId, categoryId: targetCategoryId, title: "Trashed target", status: "draft", origin: "manual", properties: {}, propertyValues: [], bodyMd: "", version: 1, updatedAt: now, deletedAt: now },
      { _id: foreignTargetId, userId: otherUserId, categoryId: targetCategoryId, title: "Foreign private target", status: "draft", origin: "manual", properties: {}, propertyValues: [], bodyMd: "", version: 1, updatedAt: now, deletedAt: null },
    ]);
    await db.careerRecords.updateOne({ _id: recordIds[1]! }, { $set: { "properties.related": { type: "relation", value: [{ recordId: liveTargetId, title: "Stale copied target" }] } } });
    await db.careerRecordRelations.insertMany([
      ...[liveTargetId, trashedTargetId, missingTargetId, foreignTargetId].map((targetRecordId) => ({ _id: randomUUID(), userId, sourceRecordId: recordIds[0]!, sourcePropertyId: related.id, targetRecordId, inversePropertyId: inverse.id, cardinality: "multiple" as const, deletePolicy: "restrict" as const, createdBy: "user" as const, createdAt: now, updatedAt: now })),
      { _id: randomUUID(), userId: otherUserId, sourceRecordId: recordIds[2]!, sourcePropertyId: related.id, targetRecordId: liveTargetId, inversePropertyId: inverse.id, cardinality: "multiple", deletePolicy: "restrict", createdBy: "user", createdAt: now, updatedAt: now },
    ]);
  }, 60_000);
  afterAll(async () => { await fixture?.dispose(); });
  function input(overrides: Partial<CreateCareerViewConfiguration> = {}): CreateCareerViewConfiguration {
    return { name: "Canonical view " + randomUUID(), type: "table", filter: null, sorts: [], groupPropertyId: null, groupOrder: [], recordOrder: [], visiblePropertyIds: [amount.id, period.id, tags.id], propertyOrder: [amount.id, period.id, tags.id], columnWidths: {}, gallery: null, board: null, timeline: null, ...overrides };
  }
  async function query(overrides: Partial<CreateCareerViewConfiguration> = {}, limit = 10) {
    const view = await service.create(userId, categoryId, 1, input(overrides));
    return { view, page: await service.query(userId, view.id, null, limit) };
  }
  it("filters and cursor-pages native decimals exactly without legacy values or Number", async () => {
    const { view, page } = await query({ filter: { propertyId: amount.id, operator: "gte", operand: { type: "number", value: large[0] } }, sorts: [{ propertyId: amount.id, direction: "asc", nulls: "last" }] }, 1);
    expect(page.data.map((row) => row.properties.amount)).toEqual([large[0]]);
    expect(page.data[0]?.propertyValues?.find((value) => value.propertyDefinitionId === amount.id)?.value).toBe(large[0]);
    const next = await service.query(userId, view.id, page.page.nextCursor, 1);
    expect(next.data.map((row) => row.properties.amount)).toEqual([large[1]]);
    expect(next.page.hasNextPage).toBe(false);
    expect(page.data[0]?.bodyMd).toBe("Original document");
    await expect(service.query(otherUserId, view.id, null, 1)).rejects.toMatchObject({ statusCode: 404 });
  });
  it("sorts month, day and datetime instants including offsets and nanoseconds", async () => {
    const { page } = await query({ sorts: [{ propertyId: period.id, direction: "asc", nulls: "last" }] });
    expect(page.data.map((row) => row.title)).toEqual(["Canonical 0", "Canonical 1", "Canonical 3", "Canonical 2"]);
    expect(page.data[0]?.propertyValues?.find((value) => value.propertyDefinitionId === period.id)).toMatchObject({ value: { precision: "month", start: "2026-08" } });
  });
  it("filters datetime equality across offsets without collapsing adjacent nanoseconds", async () => {
    const { page } = await query({ filter: { propertyId: period.id, operator: "eq", operand: { type: "date", value: { precision: "datetime", start: "2026-09-01T12:00:00.000000001+09:00", end: null, timezone: "Asia/Seoul" } } } });
    expect(page.data.map((row) => row.title)).toEqual(["Canonical 3"]);
    const monthly = await query({ filter: { propertyId: period.id, operator: "gte", operand: { type: "date", value: { precision: "month", start: "2026-09", end: null } } }, sorts: [{ propertyId: period.id, direction: "asc", nulls: "last" }] });
    expect(monthly.page.data.map((row) => row.title)).toEqual(["Canonical 3", "Canonical 2"]);
  });
  it("keeps Decimal128 cursor paging stable with explicit null placement", async () => {
    const { view, page } = await query({ sorts: [{ propertyId: amount.id, direction: "asc", nulls: "first" }] }, 1);
    expect(page.data.map((row) => row.title)).toEqual(["Canonical 3"]);
    const next = await service.query(userId, view.id, page.page.nextCursor, 2);
    expect(next.data.map((row) => row.properties.amount)).toEqual(["123.4500", large[0]]);
  });
  it("keeps a missing canonical ID empty while retaining private option IDs and unrelated values", async () => {
    const { page } = await query({ filter: { propertyId: amount.id, operator: "is_empty", operand: null } });
    expect(page.data.map((row) => row.title)).toEqual(["Canonical 3"]);
    expect(page.data[0]?.properties).not.toHaveProperty("amount");
    expect(page.data[0]?.propertyValues?.find((value) => value.propertyDefinitionId === tags.id)).toMatchObject({ value: [optionId] });
  });
  it("uses canonical custom timestamps and preserves derived and system timestamp sources", async () => {
    const custom = await query({ sorts: [{ propertyId: customTime.id, direction: "desc", nulls: "last" }] });
    expect(custom.page.data.map((row) => row.title)).toEqual(["Canonical 3", "Canonical 2", "Canonical 1", "Canonical 0"]);
    const derived = await query({ sorts: [{ propertyId: formula.id, direction: "asc", nulls: "last" }] });
    expect(derived.page.data.map((row) => row.title)).toEqual(["Canonical 3", "Canonical 2", "Canonical 1", "Canonical 0"]);
    const system = await query({ sorts: [{ propertyId: systemTime.id, direction: "desc", nulls: "last" }] });
    expect(system.page.data.map((row) => row.title)).toEqual(["Canonical 3", "Canonical 2", "Canonical 1", "Canonical 0"]);
  });
  it("filters current owned relation edges and excludes stale, trashed, purged and foreign targets", async () => {
    const current = await query({ filter: { propertyId: related.id, operator: "contains", operand: { type: "relation", value: [{ recordId: liveTargetId, title: "Old copied title" }] } }, visiblePropertyIds: [related.id], propertyOrder: [related.id] });
    expect(current.page.data.map((row) => row.title)).toEqual(["Canonical 0"]);
    const empty = await query({ filter: { propertyId: related.id, operator: "is_empty", operand: null }, visiblePropertyIds: [related.id], propertyOrder: [related.id] });
    expect(empty.page.data.map((row) => row.title).sort()).toEqual(["Canonical 1", "Canonical 2", "Canonical 3"]);
  });
  it("sorts and cursor-pages empty ledger relations with explicit null placement", async () => {
    const { view, page } = await query({ sorts: [{ propertyId: related.id, direction: "desc", nulls: "first" }], visiblePropertyIds: [related.id], propertyOrder: [related.id] }, 2);
    const emptyIds = recordIds.slice(1).sort();
    expect(page.data.map((row) => row.id)).toEqual(emptyIds.slice(0, 2));
    const next = await service.query(userId, view.id, page.page.nextCursor, 2);
    expect(next.data.map((row) => row.id)).toEqual([emptyIds[2], recordIds[0]]);
    expect(next.page.hasNextPage).toBe(false);
  });  it("reads an incoming inverse edge from the ledger without a copied physical inverse", async () => {
    const view = await service.create(userId, targetCategoryId, 1, input({ visiblePropertyIds: [inverse.id], propertyOrder: [inverse.id], filter: { propertyId: inverse.id, operator: "contains", operand: { type: "relation", value: [{ recordId: recordIds[0]!, title: "Old source title" }] } } }));
    const page = await service.query(userId, view.id, null, 10);
    expect(page.data.map((row) => row.title)).toEqual(["Live target"]);
  });
  async function relationViews(ownerCategoryId:string,definition:CareerPropertyDefinitionV2,operandId:string) {
    const views=[];
    for(const operator of ["contains","is_not_empty","is_empty"] as const) views.push(await service.create(userId,ownerCategoryId,1,input({visiblePropertyIds:[definition.id],propertyOrder:[definition.id],filter:{propertyId:definition.id,operator,operand:operator==="contains"?{type:"relation",value:[{recordId:operandId,title:"Copied title"}]}:null}})));
    return views;
  }
  it("uses the displayed relation category binding after a target moves, including saved contains and emptiness filters",async()=>{
    const db=mongoCollections(fixture.resource.db),original=await db.careerCategories.findOne({_id:targetCategoryId}),movedCategoryId=randomUUID(),edges=await db.careerRecordRelations.find({userId,sourceRecordId:recordIds[0]!}).sort({_id:1}).toArray(),views=await relationViews(categoryId,related,liveTargetId);
    await db.careerCategories.insertOne({...original!,_id:movedCategoryId,key:"moved-"+movedCategoryId});
    try {
      await db.careerRecords.updateOne({_id:liveTargetId,userId},{$set:{categoryId:movedCategoryId}});
      expect((await service.reader.getRecord(userId,recordIds[0]!)).properties.related).toEqual({type:"relation",value:[]});
      expect((await service.query(userId,views[0]!.id,null,10)).data).toHaveLength(0);expect((await service.query(userId,views[1]!.id,null,10)).data).toHaveLength(0);expect((await service.query(userId,views[2]!.id,null,10)).data.map(row=>row.id).sort()).toEqual([...recordIds].sort());
      expect(await db.careerRecordRelations.find({userId,sourceRecordId:recordIds[0]!}).sort({_id:1}).toArray()).toEqual(edges);
    } finally {await db.careerRecords.updateOne({_id:liveTargetId,userId},{$set:{categoryId:targetCategoryId}});await db.careerCategories.deleteOne({_id:movedCategoryId,userId});await db.careerViews.deleteMany({_id:{$in:views.map(view=>view.id)},userId});}
  });
  it.each(["removed","deleted"] as const)("excludes a forward edge when its current inverse definition is %s",async(state)=>{
    const db=mongoCollections(fixture.resource.db),original=await db.careerCategories.findOne({_id:targetCategoryId}),views=await relationViews(categoryId,related,liveTargetId);
    try {
      await db.careerCategories.updateOne({_id:targetCategoryId,userId},{$set:{propertySchemaV2:state==="removed"?[]:original!.propertySchemaV2!.map(definition=>({...definition,deletedAt:new Date().toISOString()}))}});
      expect((await service.reader.getRecord(userId,recordIds[0]!)).properties.related).toEqual({type:"relation",value:[]});
      expect((await service.query(userId,views[0]!.id,null,10)).data).toHaveLength(0);expect((await service.query(userId,views[1]!.id,null,10)).data).toHaveLength(0);expect((await service.query(userId,views[2]!.id,null,10)).data).toHaveLength(recordIds.length);
    } finally {await db.careerCategories.updateOne({_id:targetCategoryId,userId},{$set:{propertySchemaV2:original!.propertySchemaV2!}});await db.careerViews.deleteMany({_id:{$in:views.map(view=>view.id)},userId});}
  });
  it.each(["removed","deleted"] as const)("excludes an incoming edge when its current forward definition is %s",async(state)=>{
    const db=mongoCollections(fixture.resource.db),original=await db.careerCategories.findOne({_id:categoryId}),views=await relationViews(targetCategoryId,inverse,recordIds[0]!);
    try {
      await db.careerCategories.updateOne({_id:categoryId,userId},{$set:{propertySchemaV2:original!.propertySchemaV2!.flatMap(definition=>definition.id!==related.id?[definition]:state==="removed"?[]:[{...definition,deletedAt:new Date().toISOString()}])}});
      expect((await service.reader.getRecord(userId,liveTargetId)).properties.back).toEqual({type:"relation",value:[]});
      expect((await service.query(userId,views[0]!.id,null,10)).data).toHaveLength(0);expect((await service.query(userId,views[1]!.id,null,10)).data).toHaveLength(0);expect((await service.query(userId,views[2]!.id,null,10)).data.map(row=>row.id)).toEqual([liveTargetId]);
    } finally {await db.careerCategories.updateOne({_id:categoryId,userId},{$set:{propertySchemaV2:original!.propertySchemaV2!}});await db.careerViews.deleteMany({_id:{$in:views.map(view=>view.id)},userId});}
  });
  it("rejects unprepared records before filters can silently hide their missing arrays", async () => {
    const db = mongoCollections(fixture.resource.db);
    const id = randomUUID();
    await db.careerRecords.insertOne({ _id: id, userId, categoryId, title: "Unprepared", status: "draft", origin: "manual", properties: { amount: 0 }, bodyMd: "", version: 1, updatedAt: new Date(), deletedAt: null });
    try {
      const view = await service.create(userId, categoryId, 1, input({ filter: { propertyId: amount.id, operator: "gt", operand: { type: "number", value: 999 } } }));
      await expect(service.query(userId, view.id, null, 10)).rejects.toMatchObject({ statusCode: 409, message: "CANONICAL_VALUES_NOT_PREPARED" });
    } finally { await db.careerRecords.deleteOne({ _id: id, userId }); }
  });
  it("never classifies a partially restored own or inverse relation as completed empty or nonempty",async()=>{
    const db=mongoCollections(fixture.resource.db),category=(await db.careerCategories.findOne({_id:categoryId}))!,target=category.propertySchemaV2!.find(definition=>definition.id===related.id)!,forwardViews=await relationViews(categoryId,related,liveTargetId),inverseViews=await relationViews(targetCategoryId,inverse,recordIds[0]!);
    const unfiltered=await service.create(userId,categoryId,1,input({visiblePropertyIds:[related.id],propertyOrder:[related.id],sorts:[{propertyId:related.id,direction:"desc",nulls:"last"}]})),edges=await db.careerRecordRelations.find({userId}).sort({_id:1}).toArray(),now=new Date(),jobId=randomUUID();
    const emptyId='00000000-0000-4000-8000-000000000000';
    await db.careerRecords.insertOne({...((await db.careerRecords.findOne({_id:recordIds[0]!,userId}))!),_id:emptyId,title:'Pending empty relation',propertyValues:[]});
    const plan={userId,categoryId,categoryVersion:1,schemaVersion:1,definitions:category.propertySchemaV2!,recordIds:[recordIds[0]!],operation:{kind:"restoration",source:{...target,deletedAt:now.toISOString()},target,defaultValue:null,confirmLossy:true}};
    await db.careerPropertyMutations.insertOne({_id:jobId,userId,categoryId,propertyId:related.id,planJson:mutationCanonicalJson(plan),operationFingerprint:mutationFingerprint(plan),status:"pending",active:true,cursor:0,processedCount:0,skippedCount:0,attempts:0,leaseToken:null,leaseUntil:null,lastError:null,commitFence:0,createdAt:now,updatedAt:now,completedAt:null});
    try{
      for(const status of ["pending","failed"] as const){
        await db.careerPropertyMutations.updateOne({_id:jobId},{$set:{status}});
        const mapped=await service.reader.getRecord(userId,recordIds[0]!);expect(mapped.properties).not.toHaveProperty("related");expect(mapped.pendingRelationPropertyIds).toContain(related.id);
        for(const view of [...forwardViews,...inverseViews])expect((await service.query(userId,view.id,null,10)).data).toHaveLength(0);
        const page=await service.query(userId,unfiltered.id,null,10);expect(page.data.map(row=>row.id)).toEqual([emptyId,...recordIds].sort());expect(page.data.every(row=>row.pendingRelationPropertyIds?.includes(related.id))).toBe(true);
      }
      expect(await db.careerRecordRelations.find({userId}).sort({_id:1}).toArray()).toEqual(edges);
      await db.careerPropertyMutations.updateOne({_id:jobId},{$set:{status:"completed",active:false}});
      expect((await service.query(userId,forwardViews[0]!.id,null,10)).data.map(row=>row.id)).toEqual([recordIds[0]]);
      expect((await service.query(userId,inverseViews[0]!.id,null,10)).data.map(row=>row.id)).toEqual([liveTargetId]);
    }finally{await db.careerRecords.deleteOne({_id:emptyId,userId});await db.careerPropertyMutations.deleteOne({_id:jobId});await db.careerViews.deleteMany({_id:{$in:[...forwardViews,...inverseViews,unfiltered].map(view=>view.id)},userId});}
  });
});