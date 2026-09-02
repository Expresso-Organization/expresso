import { randomUUID } from "node:crypto";

import { CareerCategoryMoveCommitSchema, CareerPropertyDefinitionV2Schema, PreviewCareerCategoryMoveSchema } from "@expresso/contracts";
import type { CareerCategoryDoc } from "@expresso/database";
import { describe, expect, it } from "vitest";

import { careerCategoryDefinitions } from "./relations.js";

describe("career category move contracts", () => {
  it("requires the route record, signed preview and an explicit optimistic version", () => {
    expect(PreviewCareerCategoryMoveSchema.parse({ targetCategoryId: randomUUID() }).targetCategoryId).toMatch(/-/);
    expect(() => CareerCategoryMoveCommitSchema.parse({ recordId: randomUUID(), targetCategoryId: randomUUID(), previewToken: "too-short", expectedVersion: 1 })).toThrow();
  });

  it("assigns contract-safe stable IDs to legacy system properties", () => {
    const category = {
      _id: randomUUID(),
      key: "experience",
      isSystem: true,
      propertySchema: {
        role: { label: "역할", type: "text", required: false, system: false },
      },
      sortOrder: 0,
      name: "경험",
      icon: "chat-circle-dots",
      defaultView: "table",
      version: 1,
      updatedAt: new Date(),
    } satisfies CareerCategoryDoc;
    const first = careerCategoryDefinitions(category);
    const second = careerCategoryDefinitions(category);

    expect(CareerPropertyDefinitionV2Schema.array().parse(first)).toEqual(second);
    expect(first[0]?.id).toMatch(/^[0-9a-f-]{36}$/);
  });
});
