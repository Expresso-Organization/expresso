import {describe,expect,it} from "vitest";
import {careerProducerOperationId,careerProducerInputFingerprint} from "./prepared-producer.js";
const userId="00000000-0000-4000-8000-000000000001",sourceId="00000000-0000-4000-8000-000000000002";
describe("producer stable input identity",()=>{
 it("scopes stable operation UUIDs by owner/source/action/key without session data",()=>{
  const input={producer:"ai-proposal"as const,userId,sourceId,kind:"apply",idempotencyKey:"request-key-000001"};
  const id=careerProducerOperationId(input);expect(id).toMatch(/^[0-9a-f-]{14}5[0-9a-f-]{21}$/);expect(careerProducerOperationId({...input})).toBe(id);
  for(const changed of [{kind:"undo"},{userId:sourceId},{sourceId:userId},{idempotencyKey:"request-key-000002"},{producer:"interview"as const}])expect(careerProducerOperationId({...input,...changed})).not.toBe(id);
 });
 it("preserves exact raw strings and stable object ordering while rejecting non-JSON values",()=>{
  expect(careerProducerInputFingerprint({b:1,a:"123.4500"})).toBe(careerProducerInputFingerprint({a:"123.4500",b:1}));
  expect(careerProducerInputFingerprint({a:"123.4500"})).not.toBe(careerProducerInputFingerprint({a:"123.45"}));
  expect(careerProducerInputFingerprint([1,2])).not.toBe(careerProducerInputFingerprint([2,1]));
  expect(()=>careerProducerInputFingerprint({a:undefined})).toThrow();expect(()=>careerProducerInputFingerprint({a:NaN})).toThrow();
 });
});