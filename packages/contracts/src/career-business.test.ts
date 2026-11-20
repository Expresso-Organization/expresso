import { readFileSync } from "node:fs";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";
import {
  CareerBusinessPropertyValueSchema,
  CareerBusinessRecordResponseSchema,
  CareerBusinessRecordSchema,
} from "./career-business.js";
import { careerBusinessOpenApiComponents } from "./career-business-openapi.js";
import timezonePolicy from "./career-business-timezones.json" with { type: "json" };

const fixture = JSON.parse(readFileSync(new URL("../openapi/fixtures/career-business-v1.json", import.meta.url), "utf8"));
const boundaries = JSON.parse(readFileSync(new URL("../openapi/fixtures/career-business-boundaries-v1.json", import.meta.url), "utf8"));
const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats.default(ajv);
const validateResponse = ajv.compile(careerBusinessOpenApiComponents.CareerBusinessRecordResponse);
const validateValue = ajv.compile(careerBusinessOpenApiComponents.CareerBusinessPropertyValue);
const id = "00000000-0000-4000-8000-000000000081";

describe("Career business wire contract", () => {
  it("shares version boundaries with Java and OpenAPI", () => {
    for (const version of boundaries.validVersions) {
      const response = { data: { ...fixture.data, version } };
      expect(CareerBusinessRecordResponseSchema.parse(response)).toEqual(response);
      expect(validateResponse(response)).toBe(true);
    }
    for (const version of boundaries.invalidVersions) {
      const response = { data: { ...fixture.data, version } };
      expect(CareerBusinessRecordResponseSchema.safeParse(response).success).toBe(false);
      expect(validateResponse(response)).toBe(false);
    }
  });

  it("shares canonical timezone boundaries with Java without normalization", () => {
    const date = (timezone: string) => ({ propertyDefinitionId: id, type: "date", value: {
      precision: "datetime", start: "2026-10-06T10:02:03.123456789+09:00",
      end: "2026-10-06T02:02:03Z", timezone,
    } });
    for (const timezone of boundaries.validTimezones) {
      const property = date(timezone);
      expect(CareerBusinessPropertyValueSchema.parse(property)).toEqual(property);
      expect(validateValue(property)).toBe(true);
    }
    for (const timezone of boundaries.invalidTimezones) {
      const property = date(timezone);
      expect(CareerBusinessPropertyValueSchema.safeParse(property).success, timezone).toBe(false);
      expect(validateValue(property), timezone).toBe(false);
    }
  });

  it("accepts every shared canonical timezone exactly and rejects changed casing", () => {
    for (const timezone of timezonePolicy.identifiers) {
      const property = { propertyDefinitionId: id, type: "date", value: {
        precision: "datetime", start: "2026-10-06T01:02:03Z", end: null, timezone,
      } };
      expect(CareerBusinessPropertyValueSchema.parse(property)).toEqual(property);
      expect(validateValue(property), timezone).toBe(true);
      const changedCase = { ...property, value: { ...property.value, timezone: timezone.toLowerCase() } };
      expect(CareerBusinessPropertyValueSchema.safeParse(changedCase).success, timezone).toBe(false);
      expect(validateValue(changedCase), timezone).toBe(false);
    }
  });

  it("shares exact Decimal128 precision/exponent and UUID boundaries with Java", () => {
    for (const value of boundaries.validDecimals) {
      const property = { propertyDefinitionId: id, type: "number", value };
      expect(CareerBusinessPropertyValueSchema.safeParse(property).success).toBe(true);
      expect(validateValue(property)).toBe(true);
    }
    for (const value of boundaries.invalidDecimals) {
      const property = { propertyDefinitionId: id, type: "number", value };
      expect(CareerBusinessPropertyValueSchema.safeParse(property).success).toBe(false);
      expect(validateValue(property)).toBe(false);
    }
    for (const propertyDefinitionId of boundaries.validUuids) {
      expect(CareerBusinessPropertyValueSchema.safeParse({ propertyDefinitionId, type: "checkbox", value: true }).success).toBe(true);
    }
    for (const propertyDefinitionId of boundaries.invalidUuids) {
      expect(CareerBusinessPropertyValueSchema.safeParse({ propertyDefinitionId, type: "checkbox", value: true }).success).toBe(false);
    }
  });
  it("accepts the shared Spring DTO fixture without a body", () => {
    expect(CareerBusinessRecordResponseSchema.parse(fixture)).toEqual(fixture);
    expect(validateResponse(fixture), JSON.stringify(validateResponse.errors)).toBe(true);
    for (const value of fixture.data.propertyValues) {
      expect(CareerBusinessPropertyValueSchema.parse(value)).toEqual(value);
      expect(validateValue(value), JSON.stringify(validateValue.errors)).toBe(true);
    }
    expect(new Set(fixture.data.propertyValues.map((value: { type: string }) => value.type)).size).toBe(11);
  });

  it.each(["blockBody", "bodyMd", "documentVersion", "yjsState", "snapshot", "updates"])(
    "rejects document field %s in business responses",
    (field) => {
      const value = { data: { ...fixture.data, [field]: {} } };
      expect(CareerBusinessRecordResponseSchema.safeParse(value).success).toBe(false);
      expect(validateResponse(value)).toBe(false);
    },
  );

  it("preserves decimal strings, option order, asset IDs and nullable values", () => {
    expect(CareerBusinessPropertyValueSchema.parse(fixture.data.propertyValues[1]).value)
      .toBe("12345678901234567890.123400");
    const option = { propertyDefinitionId: id, type: "multi_select", value: [id, id] };
    expect(CareerBusinessPropertyValueSchema.parse(option)).toEqual(option);
    expect(validateValue(option)).toBe(true);
    expect(CareerBusinessRecordSchema.parse({ ...fixture.data, propertyValues: [], title: "" }).propertyValues).toEqual([]);
  });

  it.each([
    { propertyDefinitionId: id, type: "number", value: 1.25 },
    { propertyDefinitionId: id, type: "number", value: "1e3" },
    { propertyDefinitionId: id, type: "select", value: "label" },
    { propertyDefinitionId: id, type: "file", value: ["file-name.pdf"] },
    { propertyDefinitionId: id, type: "date", value: { precision: "month", start: "2026-13", end: null } },
    { propertyDefinitionId: id, type: "date", value: { precision: "day", start: "2024-02-29", end: null, timezone: null } },
    { propertyDefinitionId: id, type: "text", value: "", blockBody: {} },
  ])("rejects noncanonical structural values in Zod and OpenAPI", (value) => {
    expect(CareerBusinessPropertyValueSchema.safeParse(value).success).toBe(false);
    expect(validateValue(value)).toBe(false);
  });

  it("uses code point limits consistently with Java and JSON Schema", () => {
    const title = "😀".repeat(300);
    expect(CareerBusinessRecordResponseSchema.safeParse({ data: { ...fixture.data, title } }).success).toBe(true);
    expect(validateResponse({ data: { ...fixture.data, title } })).toBe(true);
    expect(CareerBusinessRecordSchema.safeParse({ ...fixture.data, title: title + "😀" }).success).toBe(false);
    expect(validateResponse({ data: { ...fixture.data, title: title + "😀" } })).toBe(false);
    const text = { propertyDefinitionId: id, type: "text", value: "😀".repeat(50_000) };
    expect(CareerBusinessPropertyValueSchema.safeParse(text).success).toBe(true);
    expect(validateValue(text)).toBe(true);
    expect(CareerBusinessPropertyValueSchema.safeParse({ ...text, value: text.value + "😀" }).success).toBe(false);
    expect(validateValue({ ...text, value: text.value + "😀" })).toBe(false);
  });

  it("validates business semantics beyond OpenAPI structure", () => {
    const duplicate = { ...fixture.data, propertyValues: [fixture.data.propertyValues[0], fixture.data.propertyValues[0]] };
    expect(CareerBusinessRecordSchema.safeParse(duplicate).success).toBe(false);
    const date = (value: unknown) => ({ propertyDefinitionId: id, type: "date", value });
    expect(CareerBusinessPropertyValueSchema.safeParse(date({
      precision: "datetime", start: "2026-10-06T01:00:00.000000002Z",
      end: "2026-10-06T01:00:00.000000001Z", timezone: "Asia/Seoul",
    })).success).toBe(false);
    expect(CareerBusinessPropertyValueSchema.safeParse(date({
      precision: "datetime", start: "2026-10-06T01:00:00Z", end: null, timezone: "not/a-zone",
    })).success).toBe(false);
    expect(CareerBusinessPropertyValueSchema.safeParse(date({
      precision: "day", start: "2026-10-06", end: "2026-10-05",
    })).success).toBe(false);
  });

  it.each(["invalid", "2026-10-06T01:00:00+99:00", "2026-02-30T01:00:00Z"])(
    "returns validation issues for malformed datetime %s",
    (start) => {
      const value = { propertyDefinitionId: id, type: "date", value: {
        precision: "datetime", start, end: "2026-10-06T02:00:00Z", timezone: null,
      } };
      expect(CareerBusinessPropertyValueSchema.safeParse(value).success).toBe(false);
    },
  );
});
