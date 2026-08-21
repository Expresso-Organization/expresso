import { randomUUID } from "node:crypto";
import { createMysqlResource } from "../../platform/mysql.js";

import type { SqlTag } from "../../platform/mysql.js";
import { afterAll, describe, expect, it } from "vitest";

import { contrastRatio, ensureReadableStyle, renderTemplate } from "./render.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describe("template contrast", () => {
  it("keeps compliant colors and corrects company colors below 4.5:1", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    const corrected = ensureReadableStyle({
      background: "#777777",
      text: "#888888",
      accent: "#777777",
      font: "sans",
      density: "comfortable",
    });
    expect(corrected.colorAdjusted).toBe(true);
    expect(corrected.contrastRatio).toBeGreaterThanOrEqual(4.5);
  });
});

describeWithDatabase("template conformance", () => {
  const sql = createMysqlResource(databaseUrl ?? "mysql://127.0.0.1:1/unused").sql;
  afterAll(async () => sql.end({ timeout: 5 }));

  it("renders every arbitrary recipe section with actual content and preserves empty state", async () => {
    const templates = await sql<{
      id: string; code: string; name: string; plan_required: "free" | "pro";
      supported_sections: string[]; style: unknown;
    }[]>`
      select id, code, name, plan_required, supported_sections, style
      from template where is_active order by code
    `;
    expect(templates.length).toBeGreaterThanOrEqual(3);
    const sections = [
      { id: randomUUID(), title: "소개", items: [{ pointText: "실제 사용자 소개" }] },
      { id: randomUUID(), title: "프로젝트", items: [{ pointText: "실제 PostgreSQL 성과" }] },
      { id: randomUUID(), title: "학술", items: [{ pointText: "실제 연구 근거" }] },
      { id: randomUUID(), title: "비어 있는 사용자 섹션", items: [] },
    ];
    for (const [index, template] of templates.entries()) {
      const preview = renderTemplate({
        templateId: template.id,
        code: template.code,
        name: template.name,
        planRequired: template.plan_required,
        supportedSections: template.supported_sections,
        style: template.style,
        recommended: index === 0,
        recommendationReason: "conformance fixture",
        sections,
        companyStyle: { background: "#777777", text: "#888888", accent: "#777777" },
      });
      expect(preview.sections.map(({ title }) => title)).toEqual(sections.map(({ title }) => title));
      expect(preview.sections[0]?.content).toEqual(["실제 사용자 소개"]);
      expect(preview.sections[3]).toMatchObject({ state: "empty", content: [] });
      expect(JSON.stringify(preview)).not.toContain("Lorem ipsum");
      expect(preview.contrastRatio).toBeGreaterThanOrEqual(4.5);
      expect(preview.colorAdjusted).toBe(true);
    }
  });
});
