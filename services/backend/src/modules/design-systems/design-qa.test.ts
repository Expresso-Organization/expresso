import { contrastRatio, designQa, readableColors } from "@expresso/portfolio-renderer";
import { describe, expect, it } from "vitest";

import { catalogEntries } from "./catalog.js";

const revisions = catalogEntries().map(({ revision }) => revision);

describe("디자인 시스템 토큰 품질 검사", () => {
  it("38종 모두 보정 뒤 대비·본문 크기·웹폰트 검사를 통과한다", () => {
    expect(revisions).toHaveLength(38);
    for (const revision of revisions) {
      const failed = designQa(revision.spec).filter((check) => check.status === "fail");
      expect(failed, `${revision.code}: ${failed.map((check) => check.detail).join(" / ")}`).toEqual([]);
    }
  });

  it("기준을 넘는 토큰은 그대로 두고, 모자란 토큰만 글자색 쪽으로 섞는다", () => {
    for (const { spec, code } of revisions) {
      const readable = readableColors(spec);
      const { muted, canvas, accent } = spec.colors;
      if (contrastRatio(muted.value, canvas.value) >= 4.5) expect(readable.mutedOnCanvas, code).toBe(muted.value);
      if (contrastRatio(accent.value, canvas.value) >= 4.5) expect(readable.accentText, code).toBe(accent.value);
      expect(contrastRatio(readable.mutedOnSurface, spec.colors.surface.value), code).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(readable.accentText, canvas.value), code).toBeGreaterThanOrEqual(4.5);
    }
  });
});
