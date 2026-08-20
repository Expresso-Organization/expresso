import { describe, expect, it } from "vitest";

import { avatarTint } from "./company-avatar-tint";

describe("avatarTint", () => {
  it("같은 회사는 늘 같은 색이다 — 다시 그릴 때마다 바뀌면 안 된다", () => {
    expect(avatarTint("당근마켓")).toEqual(avatarTint("당근마켓"));
  });

  it("이름의 공백과 대소문자는 색을 가르지 않는다", () => {
    expect(avatarTint("  Coupang ")).toEqual(avatarTint("coupang"));
  });

  it("회사가 다르면 색이 갈린다", () => {
    const names = ["당근마켓", "Coupang", "KRAFTON", "Moloco", "Sendbird", "토스"];
    const tints = new Set(names.map((name) => avatarTint(name).background));
    // 여섯 색이라 충돌이 아예 없을 수는 없다. 한 색으로 뭉치지만 않으면 된다.
    expect(tints.size).toBeGreaterThan(1);
  });

  it("바탕과 글자는 같은 색상에서 밝기만 벌린다 — 대비가 한 번에 맞는다", () => {
    const { background, color } = avatarTint("아무개");
    const hueOf = (value: string) => /^hsl\((\d+)/.exec(value)?.[1];
    expect(hueOf(background)).toBe(hueOf(color));
    expect(background).toContain("93%");
    expect(color).toContain("30%");
  });

  it("빈 이름에도 색을 낸다 — 화면이 색 없이 서지 않는다", () => {
    expect(avatarTint("").background).toMatch(/^hsl\(/);
  });
});
