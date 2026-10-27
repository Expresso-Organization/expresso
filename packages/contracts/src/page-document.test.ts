import { describe, expect, it } from "vitest";
import { pageDocument, pageDocumentPolicy, pagePreviewDocument, SCENE_RUNTIME_ENTRY } from "./page.js";

describe("지면 문서 껍데기와 스크립트 정책", () => {
  it("장면 표식이 있는 지면에만 장면 런타임을 싣는다", () => {
    const withScene = pageDocument({ html: '<header><div class="xp-backdrop" data-scene="orb"></div></header>', css: "", title: "시험" });
    expect(withScene).toContain(`<script type="module" src="${SCENE_RUNTIME_ENTRY}"></script>`);
    expect(pageDocument({ html: '<header><div class="xp-backdrop" data-shape="grid"></div></header>', css: "", title: "시험" })).not.toContain("<script");
    // 글 속의 낱말은 표식이 아닙니다.
    expect(pageDocument({ html: "<p>data-scene 속성을 설명합니다.</p>", css: "", title: "시험" })).not.toContain("<script");
  });

  it("문서 응답은 불투명 출처로 열리고 장면 런타임 폴더의 스크립트만 허용한다", () => {
    const policy = pageDocumentPolicy("https://expresso.ai.kr");
    expect(policy).toContain("sandbox allow-scripts allow-popups;");
    expect(policy).not.toContain("allow-same-origin");
    expect(policy).toContain("script-src https://expresso.ai.kr/scene-runtime/v1/;");
    expect(policy).not.toMatch(/'unsafe-inline'|'self'|\*/);
    expect(policy).toContain("form-action 'none'");
    expect(pageDocumentPolicy("http://backdrop.localhost:3204/")).toContain("script-src http://backdrop.localhost:3204/scene-runtime/v1/;");
  });

  it("생성 중 미리보기는 지금처럼 스크립트를 모두 막는다", () => {
    const preview = pagePreviewDocument({ html: '<div class="xp-backdrop" data-scene="orb"></div>', css: "", title: "시험" });
    expect(preview).toContain("script-src 'none'");
  });
});
