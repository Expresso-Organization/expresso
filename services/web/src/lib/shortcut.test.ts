import { describe, expect, it } from "vitest";

import { isApplePlatform, shortcutLabel } from "./shortcut";

describe("isApplePlatform", () => {
  it.each(["MacIntel", "macOS", "iPhone", "iPad", "iPod touch"])(
    "%s는 Apple 플랫폼이다",
    (platform) => {
      expect(isApplePlatform(platform)).toBe(true);
    },
  );

  it.each(["Win32", "Windows", "Linux x86_64", "Android", ""])(
    "%s는 Apple 플랫폼이 아니다",
    (platform) => {
      expect(isApplePlatform(platform)).toBe(false);
    },
  );
});

describe("shortcutLabel", () => {
  it("Apple 플랫폼은 ⌘를 붙인다", () => {
    expect(shortcutLabel("K", true)).toBe("⌘K");
    expect(shortcutLabel("↵", true)).toBe("⌘↵");
  });

  it("그 밖의 플랫폼은 Ctrl+를 붙인다", () => {
    expect(shortcutLabel("K", false)).toBe("Ctrl+K");
    expect(shortcutLabel("↵", false)).toBe("Ctrl+↵");
  });
});
