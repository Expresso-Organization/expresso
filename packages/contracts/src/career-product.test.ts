import { describe, expect, it } from "vitest";
import { CareerRecordSchema, CreateCareerRecordSchema, UpdateCareerRecordSchema } from "./career.js";

const id = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const record = { id, categoryId: other, title: "", status: "draft", origin: "manual", properties: {}, bodyMd: "", version: 1, updatedAt: "2026-09-01T00:00:00Z" };
const precise = [
  { propertyDefinitionId: id, type: "number", value: "123.4500" },
  { propertyDefinitionId: other, type: "date", value: { precision: "datetime", start: "2026-09-01T12:30:00.123456789+09:00", end: null, timezone: "Asia/Seoul" } },
];

describe("canonical Career product contracts", () => {
  it("preserves canonical decimal scale and datetime precision in product reads", () => {
    expect(CareerRecordSchema.parse({ ...record, propertyValues: precise })).toMatchObject({ propertyValues: precise });
    expect(CareerRecordSchema.parse(record)).not.toHaveProperty("propertyValues");
  });
  it("allows canonical decimal strings beyond the legacy limit only in product reads", () => {
    const decimal = "0." + "0".repeat(6_000) + "1";
    expect(CareerRecordSchema.parse({ ...record, properties: { score: decimal } }).properties.score).toBe(decimal);
    expect(CreateCareerRecordSchema.safeParse({ categoryId: id, properties: { score: decimal } }).success).toBe(false);
    expect(UpdateCareerRecordSchema.safeParse({ properties: { score: decimal } }).success).toBe(false);
    expect(CareerRecordSchema.safeParse({ ...record, properties: { score: "a".repeat(5_001) } }).success).toBe(false);
  });
  it("accepts date ranges ordered by original instants across offsets and nanoseconds", () => {
    const value = { type: "date", value: { start: "2026-09-01T12:00:00.000000001+09:00", end: "2026-09-01T03:00:00.000000002Z", timezone: "Asia/Seoul" } };
    expect(CareerRecordSchema.parse({ ...record, properties: { period: value } }).properties.period).toEqual(value);
  });
  it("rejects date ranges whose lexical order hides a reversed instant", () => {
    const value = { type: "date", value: { start: "2026-09-01T04:00:00Z", end: "2026-09-01T12:00:00+09:00", timezone: "Asia/Seoul" } };
    expect(CareerRecordSchema.safeParse({ ...record, properties: { period: value } }).success).toBe(false);
  });
  it("preserves equal date endpoints and legacy fractional precision", () => {
    const fraction = "123456789123456789";
    const value = { type: "date", value: { start: "2026-09-01T12:00:00." + fraction + "+09:00", end: "2026-09-01T03:00:00." + fraction + "Z", timezone: "Asia/Seoul" } };
    expect(CareerRecordSchema.parse({ ...record, properties: { period: value } }).properties.period).toEqual(value);
  });
  it("accepts business title code points in reads while keeping legacy write limits", () => {
    const title = "🧡".repeat(300);
    expect(CareerRecordSchema.parse({ ...record, title }).title).toBe(title);
    expect(CreateCareerRecordSchema.safeParse({ categoryId: id, title }).success).toBe(false);
    expect(UpdateCareerRecordSchema.safeParse({ title }).success).toBe(false);
  });
  it("preserves canonical typed Unicode text and contact values in read projections", () => {
    const properties = { narrative: { type: "text", value: "🧡".repeat(50_000) }, contact: { type: "phone", value: "🧡".repeat(2_000) } };
    expect(CareerRecordSchema.parse({ ...record, properties }).properties).toEqual(properties);
    expect(UpdateCareerRecordSchema.safeParse({ properties }).success).toBe(false);
  });
  it("accepts a per-definition delta without requiring unrelated properties", () => {
    const delta = { set: [precise[0]], unsetPropertyIds: [other] };
    expect(UpdateCareerRecordSchema.parse({ propertyValues: delta })).toEqual({ propertyValues: delta });
  });
  it("accepts precise canonical create values with the existing title and body fields", () => {
    expect(CreateCareerRecordSchema.parse({ categoryId: id, title: "제목", bodyMd: "본문", propertyValues: precise })).toMatchObject({ propertyValues: precise, properties: {} });
  });
  it("rejects duplicate canonical IDs and mixed legacy/canonical edits", () => {
    expect(CareerRecordSchema.safeParse({ ...record, propertyValues: [precise[0], precise[0]] }).success).toBe(false);
    expect(UpdateCareerRecordSchema.safeParse({ properties: {}, propertyValues: { set: [], unsetPropertyIds: [] } }).success).toBe(false);
    expect(CreateCareerRecordSchema.safeParse({ categoryId: id, properties: { score: 3 }, propertyValues: [] }).success).toBe(false);
  });
  it("preserves select null separately from explicit unsetting", () => {
    expect(UpdateCareerRecordSchema.parse({ propertyValues: { set: [{ propertyDefinitionId: id, type: "select", value: null }], unsetPropertyIds: [] } })).toMatchObject({ propertyValues: { set: [{ value: null }], unsetPropertyIds: [] } });
    expect(UpdateCareerRecordSchema.parse({ propertyValues: { set: [], unsetPropertyIds: [id] } })).toMatchObject({ propertyValues: { set: [], unsetPropertyIds: [id] } });
  });
});
describe("pending Career property mutation reads", () => {
  it("preserves an authenticated source definition overlay without accepting it in writes", () => {
    const sourceProperty = { id, key: "choice", name: "선택", type: "select", required: false, system: false, config: { options: [{ id: other, name: "원래 선택" }] }, order: 0, version: 1, deletedAt: null };
    const pendingPropertyMutation = { jobId: other, status: "running", retryable: false, sourceProperty };
    expect(CareerRecordSchema.parse({ ...record, pendingPropertyMutation })).toHaveProperty("pendingPropertyMutation", pendingPropertyMutation);
    expect(CareerRecordSchema.parse({ ...record, pendingPropertyMutation: { ...pendingPropertyMutation, status: "failed", retryable: true, sourceProperty: null } })).toHaveProperty("pendingPropertyMutation.sourceProperty", null);
    expect(UpdateCareerRecordSchema.safeParse({ pendingPropertyMutation }).success).toBe(false);
    expect(CareerRecordSchema.safeParse({ ...record, pendingPropertyMutation: { ...pendingPropertyMutation, status: "complete" } }).success).toBe(false);
  });
});
describe("canonical duplicate relation inputs",()=>{
 it("preserves explicit initial relations beside exact scalar values",()=>{
  const initialRelations=[{propertyId:id,targetIds:[other]}];
  expect(CreateCareerRecordSchema.parse({categoryId:other,propertyValues:precise,initialRelations})).toMatchObject({propertyValues:precise,initialRelations});
  expect(CreateCareerRecordSchema.safeParse({categoryId:other,initialRelations:[...initialRelations,...initialRelations]}).success).toBe(false);
 });
});