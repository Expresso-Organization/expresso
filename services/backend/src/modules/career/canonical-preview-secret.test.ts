import {describe,expect,it} from "vitest";
import type {MongoContext} from "../../platform/mongodb.js";
import {MongoCanonicalCareerPropertySchemaService} from "./canonical-property-schema.js";
describe("schema preview UTF-8 key boundary",()=>{
 it("matches runtime configuration byte policy without disclosing the key",()=>{
  expect(()=>new MongoCanonicalCareerPropertySchemaService({} as MongoContext,"가".repeat(11))).not.toThrow();
  expect(()=>new MongoCanonicalCareerPropertySchemaService({} as MongoContext,"a".repeat(32))).not.toThrow();
  expect(()=>new MongoCanonicalCareerPropertySchemaService({} as MongoContext,"가".repeat(10))).toThrow(/32.*bytes/);
 });
});