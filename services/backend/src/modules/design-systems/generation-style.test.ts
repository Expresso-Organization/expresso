import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { catalogEntries } from "./catalog.js";
import {
  findDesignSystemRevision,
  generationStyleFor,
} from "./generation-style.js";

type SeedTemplate = {
  _id: string;
  code: string;
  style: Record<string, string>;
};
const seeds = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL(
        "../../../../../packages/database/src/mongodb-migrations/0001/seeds.json",
        import.meta.url,
      ),
    ),
    "utf8",
  ),
) as { collection: string; documents: SeedTemplate[] }[];
const templates = new Map(
  seeds
    .find(({ collection }) => collection === "templates")!
    .documents.map((doc) => [doc._id, doc]),
);
const revisions = catalogEntries().map(({ revision }) => revision);
const BUILTIN_CODES = new Set(["clarity", "signal", "editorial"]);

describe("디자인 시스템 판의 생성 스타일 변환", () => {
  it("기존 템플릿과 연결된 판은 그 템플릿을 쓰고, 프리셋 30종은 템플릿 스타일 값과 같다", () => {
    const linked = revisions.filter(
      (revision) => revision.legacyTemplateId !== null,
    );
    expect(linked).toHaveLength(33);
    const lower = (style: Record<string, string>) =>
      Object.fromEntries(
        Object.entries(style).map(([key, value]) => [key, value.toLowerCase()]),
      );
    for (const revision of linked) {
      const template = templates.get(revision.legacyTemplateId!);
      expect(template, revision.code).toBeDefined();
      const { templateId, styleOverrides } = generationStyleFor(revision);
      expect(templateId).toBe(template!._id);
      const expected = lower({
        structure: "single-column",
        ...template!.style,
      });
      const actual = lower(styleOverrides);
      if (BUILTIN_CODES.has(revision.code)) {
        // 내장 3종은 디자인 시스템으로 옮기며 색을 다시 골랐다. 카탈로그에 보이는 판의 색을 쓴다.
        expect(
          { ...actual, background: "", text: "", accent: "" },
          revision.code,
        ).toEqual({
          ...expected,
          background: "",
          text: "",
          accent: "",
        });
        expect(actual.background).toBe(
          revision.spec.colors.canvas.value.toLowerCase(),
        );
      } else {
        expect(actual, revision.code).toEqual(expected);
      }
    }
  });

  it("템플릿과 연결되지 않은 판은 내장 Clarity 틀에 판의 토큰을 얹는다", () => {
    const unlinked = revisions.filter(
      (revision) => revision.legacyTemplateId === null,
    );
    expect(unlinked.length).toBeGreaterThan(0);
    for (const revision of unlinked) {
      const { templateId, styleOverrides } = generationStyleFor(revision);
      expect(templates.get(templateId)?.code).toBe("clarity");
      expect(styleOverrides.background).toBe(revision.spec.colors.canvas.value);
      expect(styleOverrides.text).toBe(revision.spec.colors.text.value);
      expect(styleOverrides.accent).toBe(revision.spec.colors.accent.value);
      expect(styleOverrides.structure).toBe(revision.spec.composition.layout);
    }
  });

  it("판 ID로 카탈로그의 판을 찾고, 없으면 null이다", () => {
    expect(findDesignSystemRevision(revisions[0]!.revisionId)?.code).toBe(
      revisions[0]!.code,
    );
    expect(
      findDesignSystemRevision("00000000-0000-4000-8000-000000000000"),
    ).toBeNull();
  });
});
