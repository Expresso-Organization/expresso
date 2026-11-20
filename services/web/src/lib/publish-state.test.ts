import type { PortfolioSummary } from "@expresso/contracts";
import { describe, expect, it } from "vitest";

import { PUBLISH_ACTION_LABEL, publishState } from "./publish-state";

const deployment = (hasUnpublishedChanges: boolean): NonNullable<PortfolioSummary["deployment"]> => ({
  id: "00000000-0000-4000-8000-000000000001",
  version: 2,
  subdomain: "minjae",
  customDomain: null,
  seoIndexable: false,
  contactVisibility: "hidden",
  publishedAt: "2026-11-20T00:00:00.000Z",
  hasUnpublishedChanges,
});

describe("publishState", () => {
  it("배포한 적이 없으면 draft", () => {
    expect(publishState({ status: "draft", deployment: null })).toBe("draft");
  });

  it("공개 중이고 고친 것이 없으면 live, 있으면 changed", () => {
    expect(publishState({ status: "published", deployment: deployment(false) })).toBe("live");
    expect(publishState({ status: "published", deployment: deployment(true) })).toBe("changed");
  });

  it("배포한 판이 있어도 공개를 중단했으면 unlisted", () => {
    expect(publishState({ status: "unlisted", deployment: deployment(true) })).toBe("unlisted");
  });

  it("편집 화면 버튼은 상태마다 할 일을 부른다", () => {
    expect(PUBLISH_ACTION_LABEL).toEqual({ draft: "배포하기", changed: "다시 배포", live: "배포 관리", unlisted: "다시 공개" });
  });
});
