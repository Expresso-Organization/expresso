import { CareerGoalSchema, CareerRecordStatusSchema, DummyAccountKeySchema, MAX_EXPERIENCE_YEARS, TargetRoleSchema } from "@expresso/contracts";
import { CAREER_CATEGORY_TEMPLATES } from "@expresso/database";
import { describe, expect, it } from "vitest";

import { PERSONAS, personaEmail } from "./index.js";

const DATE = /^(\d{4}-(0[1-9]|1[0-2]))(\/(\d{4}-(0[1-9]|1[0-2]))?)?$/;

describe("dummy personas", () => {
  it("spans record volumes from very few to very many", () => {
    expect(PERSONAS.map((persona) => [persona.key, persona.records.length])).toEqual([
      ["dummy-newgrad", 3], ["dummy-career-switch", 10], ["dummy-data-analyst", 25], ["dummy-ml-research", 50], ["dummy-staff-platform", 100],
    ]);
  });

  it("uses unique keys, test-domain emails and valid profiles", () => {
    expect(new Set(PERSONAS.map(({ key }) => key)).size).toBe(PERSONAS.length);
    for (const persona of PERSONAS) {
      expect(DummyAccountKeySchema.safeParse(persona.key).success).toBe(true);
      expect(personaEmail(persona)).toMatch(/@expresso\.test$/);
      expect(persona.displayName.length).toBeGreaterThan(0);
      for (const role of persona.profile.targetRoles) expect(TargetRoleSchema.safeParse(role).success).toBe(true);
      expect(CareerGoalSchema.safeParse(persona.profile.primaryGoal).success).toBe(true);
      expect(persona.profile.experienceYears).toBeGreaterThanOrEqual(0);
      expect(persona.profile.experienceYears).toBeLessThanOrEqual(MAX_EXPERIENCE_YEARS);
    }
  });

  for (const persona of PERSONAS) {
    it(`${persona.key} records fit the default category templates`, () => {
      const refs = new Map<string, string>();
      for (const record of persona.records) {
        if (!record.ref) continue;
        expect(refs.has(record.ref), `duplicate ref ${record.ref}`).toBe(false);
        refs.set(record.ref, record.category);
      }
      const titles = new Set<string>();
      for (const record of persona.records) {
        const where = `${persona.key} · ${record.title}`;
        const template = CAREER_CATEGORY_TEMPLATES.find(({ key }) => key === record.category);
        expect(template, where).toBeDefined();
        expect(record.title.trim().length, where).toBeGreaterThan(0);
        expect(record.title.length, where).toBeLessThanOrEqual(300);
        expect(titles.has(`${record.category}:${record.title}`), `duplicate title ${where}`).toBe(false);
        titles.add(`${record.category}:${record.title}`);
        expect(record.body.trim().length, where).toBeGreaterThan(0);
        if (record.status) expect(CareerRecordStatusSchema.safeParse(record.status).success, where).toBe(true);
        for (const [key, value] of Object.entries(record.props ?? {})) {
          const definition = template!.properties.find((property) => property.key === key);
          expect(definition, `${where} · unknown property ${key}`).toBeDefined();
          const type = definition!.type;
          if (type === "text" || type === "url" || type === "select") expect(typeof value, `${where} · ${key}`).toBe("string");
          if (type === "url") expect(value as string, `${where} · ${key}`).toMatch(/^https:\/\//);
          if (type === "multi_select") expect(Array.isArray(value) && value.every((item) => typeof item === "string" && item.trim()), `${where} · ${key}`).toBe(true);
          if (type === "date") {
            expect(value as string, `${where} · ${key}`).toMatch(DATE);
            const [start, end] = (value as string).split("/");
            if (end) expect(end >= start!, `${where} · ${key} ends before it starts`).toBe(true);
          }
          if (type === "relation") {
            const targets = (value as { refs: string[] }).refs;
            expect(Array.isArray(targets) && targets.length > 0, `${where} · ${key}`).toBe(true);
            for (const target of targets) expect(refs.get(target), `${where} · ${key} → ${target}`).toBe(definition!.targetKey);
          }
        }
      }
    });
  }
});
