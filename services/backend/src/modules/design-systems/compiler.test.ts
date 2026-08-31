import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { builtinDesignSystems } from "./builtins.js";
import {
  compileDesignDocuments,
  renderDesignHtml,
} from "./compiler.js";
import { referoDesignSystems } from "./refero-catalog.js";

const COLOR_TOKENS = [
  "canvas",
  "surface",
  "elevated",
  "text",
  "muted",
  "border",
  "accent",
  "action",
  "actionText",
] as const;

const SAMPLE_KINDS = [
  "hero",
  "case-study",
  "long-body",
  "metric",
  "before-after",
  "image",
  "no-image",
  "tags",
  "quote",
  "link-contact",
  "footer",
] as const;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeMarkdown(value: string): string {
  return value.replace(/([\\`*_{}\[\]<>#])/g, "\\$1");
}

function occurrences(value: string, pattern: string): number {
  return value.split(pattern).length - 1;
}

describe("design system compiler", () => {
  it("기본 디자인 세 종을 같은 모델에서 결정적으로 컴파일한다", () => {
    for (const entry of Object.values(builtinDesignSystems)) {
      const first = compileDesignDocuments(entry.spec, entry.referenceLock);
      const second = compileDesignDocuments(entry.spec, entry.referenceLock);

      expect(first).toEqual(second);
      expect(first.model.sections).toHaveLength(12);
      expect(first.model.sampleEntries).toHaveLength(11);
      expect(first.html).toContain('name="design-spec-version" content="2"');
      expect(first.html).toContain(
        `name="design-md-sha256" content="${first.markdownSha256}"`,
      );
      expect(first.markdownSha256).toBe(
        createHash("sha256").update(first.markdown).digest("hex"),
      );
      expect(first.contentHash).toBe(
        createHash("sha256")
          .update(`${first.markdown}\0${first.html}`)
          .digest("hex"),
      );
      expect(first.contentHash).not.toBe(first.markdownSha256);

      for (const value of first.model.sections) {
        expect(first.markdown).toContain(`## ${escapeMarkdown(value.title)}`);
        expect(first.html).toContain(`data-design-section="${value.id}"`);
        for (const line of value.body) {
          expect(first.markdown).toContain(escapeMarkdown(line));
          expect(first.html).toContain(escapeHtml(line));
        }
      }

      for (const token of COLOR_TOKENS) {
        expect(first.html).toContain(`--${token}:${entry.spec.colors[token].value};`);
      }
      for (const font of ["display", "body", "mono"] as const) {
        expect(first.html).toContain(`--font-${font}:`);
      }
      for (const kind of SAMPLE_KINDS) {
        expect(occurrences(first.html, `data-sample-kind="${kind}"`)).toBe(1);
      }

      expect(first.html).toContain(escapeHtml(entry.referenceLock.signatureMove));
      expect(first.html).toContain(entry.referenceLock.primaryDirection.designSystemCode);
      for (const role of [...entry.spec.colors.roles, ...entry.spec.rules.tokenRoles]) {
        expect(first.markdown).toContain(role.token);
        expect(first.markdown).toContain(escapeMarkdown(role.role));
        expect(first.html).toContain(escapeHtml(role.usage));
      }

      expect(first.html).not.toMatch(/<script\b/i);
      expect(first.html).not.toMatch(/(?:src|href)=["']https?:/i);
      expect(first.html).not.toMatch(/@import\b/i);
      expect(first.html).not.toMatch(/gradient\(/i);
      expect(first.html).toContain("overflow-wrap:anywhere");
      expect(first.html).toContain("font-size:var(--type-example-display)");
      expect(first.html).toContain("Content-Security-Policy");
    }
  });

  it("Clarity, Signal, Editorial의 시각 방향을 서로 다르게 보존한다", () => {
    const entries = Object.values(builtinDesignSystems);
    expect(new Set(entries.map(({ spec }) => spec.colors.accent.value)).size).toBe(3);
    expect(new Set(entries.map(({ spec }) => spec.composition.structure)).size).toBe(3);
    expect(new Set(entries.map(({ spec }) => spec.imagery.mode)).size).toBe(3);
    expect(builtinDesignSystems.signal.spec.colors.canvas.value).toBe("#0b1220");
    expect(builtinDesignSystems.editorial.spec.typography.display.family).toBe("Georgia");
  });

  it("Apple r2만 고품질 Live Preview를 사용한다", () => {
    const apple = compileDesignDocuments(
      referoDesignSystems.apple.spec,
      referoDesignSystems.apple.referenceLock,
    );
    const mercury = compileDesignDocuments(
      referoDesignSystems.mercury.spec,
      referoDesignSystems.mercury.referenceLock,
    );

    expect(referoDesignSystems.apple.code).toBe("refero-apple");
    expect(referoDesignSystems.apple.spec.identity.name).toBe("Apple");
    expect(referoDesignSystems.apple.referenceLock.primaryDirection.revision).toBe(2);
    expect(apple.html).toContain('class="doc-section');
    expect(apple.html).toContain('class="row-label"');
    expect(apple.html).toContain('class="palette"');
    expect(apple.html).toContain('class="variant-grid"');
    expect(apple.html).toContain("Live portfolio 보기");
    expect(mercury.html).not.toContain('class="doc-section');
    expect(mercury.html).not.toContain('class="row-label"');
    expect(mercury.html).not.toContain('class="variant-grid"');
    for (const kind of SAMPLE_KINDS) {
      expect(occurrences(apple.html, `data-sample-kind="${kind}"`)).toBe(1);
    }
  });

  it("문서 문자열을 HTML로 실행하지 않고 텍스트로 표시한다", () => {
    const spec = structuredClone(builtinDesignSystems.clarity.spec);
    spec.identity.description = '<img src=x onerror="alert(1)">';
    const compiled = compileDesignDocuments(
      spec,
      builtinDesignSystems.clarity.referenceLock,
    );
    expect(compiled.html).not.toContain('<img src=x onerror="alert(1)">');
    expect(compiled.html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });

  it("HTML 메타데이터에는 올바른 SHA-256 형식만 받는다", () => {
    const compiled = compileDesignDocuments(
      builtinDesignSystems.clarity.spec,
      builtinDesignSystems.clarity.referenceLock,
    );
    expect(() => renderDesignHtml(compiled.model, "not-a-hash")).toThrow(
      "markdownSha256 must be a lowercase SHA-256 digest",
    );
  });

  it("선언하지 않은 디자인 토큰 참조를 거부한다", () => {
    const spec = structuredClone(builtinDesignSystems.clarity.spec);
    spec.components.hero!.tokens = ["missing-token"];
    expect(() => compileDesignDocuments(
      spec,
      builtinDesignSystems.clarity.referenceLock,
    )).toThrow("Unknown design token reference: missing-token");
  });
});
