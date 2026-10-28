import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { SITE_TRACKER_SCRIPT, SITE_TRACKER_SCRIPT_SOURCE, withSiteTracker } from "./site-tracker";

const DOCUMENT = "<!doctype html><html><head><title>시험</title></head><body><section>하나</section></body></html>";

describe("공개 문서의 추적 스크립트", () => {
  it("본문 끝에 스크립트를, head에 섹션 수를 붙이고 문서 안에 스크립트 정책을 두지 않는다", () => {
    const tracked = withSiteTracker(DOCUMENT, 1);
    expect(tracked).toContain('<meta name="expresso-sections" content="1">');
    expect(tracked).toContain(`<script>${SITE_TRACKER_SCRIPT}</script>\n</body>`);
    // 헤더 정책과 함께 걸리면 장면 런타임이 막힌다.
    expect(tracked).not.toContain("Content-Security-Policy");
  });

  it("헤더 정책에 넣는 해시가 붙인 스크립트와 맞는다", () => {
    const digest = createHash("sha256").update(SITE_TRACKER_SCRIPT).digest("base64");
    expect(SITE_TRACKER_SCRIPT_SOURCE).toBe(`'sha256-${digest}'`);
  });
});
