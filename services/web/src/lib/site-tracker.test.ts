import { createHash } from "node:crypto";
import { PAGE_SCRIPT_POLICY_MARK, pageDocument } from "@expresso/contracts";
import { describe, expect, it } from "vitest";
import { SITE_TRACKER_SCRIPT, withSiteTracker } from "./site-tracker";

const hash = (text: string) => `'sha256-${createHash("sha256").update(text).digest("base64")}'`;
const policies = (document: string) => [...document.matchAll(/http-equiv="Content-Security-Policy"[^>]*content="([^"]+)"/g)].map((match) => match[1]!);

describe("공개 지면의 추적 스크립트", () => {
  it("그림 스크립트가 없는 지면에는 추적 스크립트 하나만 도는 정책을 단다", () => {
    const document = withSiteTracker(pageDocument({ html: "<main>x</main>", css: "", title: "t" }), 0, "https://ha.expresso.test");
    expect(policies(document)).toEqual([expect.stringContaining(`script-src ${hash(SITE_TRACKER_SCRIPT)}`)]);
  });

  it("그림 스크립트를 실은 지면은 정책을 하나로 둔다 — 추적 해시와 그림 출처를 그 정책에 더한다", () => {
    const published = pageDocument({ html: "<main><canvas></canvas></main>", css: "", title: "t", script: "draw()", run: { origin: "" } });
    const document = withSiteTracker(published, 2, "https://ha.expresso.test");
    const [policy, ...rest] = policies(document);
    expect(rest).toEqual([]);
    expect(policy).toContain(hash(SITE_TRACKER_SCRIPT));
    expect(policy).toContain(hash("draw()"));
    expect(policy).toContain("img-src https://ha.expresso.test data: blob:");
    expect(policy).toContain("connect-src 'none'");
    expect(document).toContain(PAGE_SCRIPT_POLICY_MARK);
    expect(document).toContain('<meta name="expresso-sections" content="2">');
    expect(document).toContain(`<script>${SITE_TRACKER_SCRIPT}</script>`);
  });
});
