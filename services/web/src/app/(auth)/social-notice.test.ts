import { describe, expect, it } from "vitest";

import { socialNotice } from "./social-notice";

describe("socialNotice", () => {
  it("아는 코드에는 다음 행동을 말해 준다", () => {
    expect(socialNotice("google_expired")).toContain("다시");
  });

  it("모르는 코드에는 아무 말도 하지 않는다 — 주소창으로 문장을 심을 수 없다", () => {
    expect(socialNotice("<script>alert(1)</script>")).toBeUndefined();
    expect(socialNotice("아무거나")).toBeUndefined();
    expect(socialNotice(undefined)).toBeUndefined();
  });
});
