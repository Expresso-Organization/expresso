import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {createMongoFixture} from "../../test/support/mongodb.js";

describe.skipIf(!process.env.TEST_MONGODB_URL)("Mongo readiness configured replica set",()=>{
 let fixture:Awaited<ReturnType<typeof createMongoFixture>>;
 beforeAll(async()=>{fixture=await createMongoFixture("readyset");},60_000);
 afterAll(async()=>{await fixture?.dispose();});
 it("accepts the primary and migrated schema of the replica set named in its URI",async()=>{
  await expect(fixture.resource.readinessCheck.run()).resolves.toBeUndefined();
 });
});
