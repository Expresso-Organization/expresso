import { describe, expect, it } from "vitest";
import { describeDesignLayout, designLayout } from "@expresso/portfolio-renderer";

import { catalogEntries } from "./catalog.js";

describe("38종 디자인의 배치 문단", () => {
  it("문단의 배치 종류 · 폭 · 컨테이너 허용이 배치 계산 결과와 같다", () => {
    const revisions = catalogEntries().map(({ revision }) => revision);
    expect(revisions).toHaveLength(38);
    for (const revision of revisions) {
      const layout = designLayout(revision.spec);
      const text = describeDesignLayout(layout, revision.spec.identity.name);
      expect(layout.kind, revision.code).toBe(revision.spec.composition.layout);
      expect(text, revision.code).toContain(revision.spec.identity.name);
      if (layout.kind === "wide-margin") {
        expect(layout.groups, revision.code).toEqual([]);
        expect(text, revision.code).toContain(`왼쪽 칸(약 ${layout.headWidth}px)`);
        expect(text, revision.code).toContain(`오른쪽 칸(약 ${layout.bodyWidth}px)`);
      } else {
        expect(layout.groups.length, revision.code).toBe(3);
        expect(text, revision.code).toContain(`폭 약 ${layout.bodyWidth}px`);
        expect(text, revision.code).toContain(`even 약 ${layout.columns!.even[0]}·${layout.columns!.even[1]}px`);
      }
    }
  });
});
