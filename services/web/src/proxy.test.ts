import { describe, expect, it } from "vitest";

import { config } from "./proxy";

describe("session proxy matcher", () => {
  it("공개 포트폴리오는 열고 후보자 편집 화면만 보호한다", () => {
    expect(config.matcher).not.toContain("/site/:path*");
    expect(config.matcher).toContain("/site/:slug/candidates/:path*");
  });
});
