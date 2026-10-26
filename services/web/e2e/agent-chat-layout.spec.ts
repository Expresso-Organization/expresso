import { expect, test } from "@playwright/test";

import { login } from "./fixtures";

test("draws the scroll-to-bottom arrow at 16px inside its round button", async ({ page }) => {
  await login(page, "/agent");
  const button = page.locator(".aui-thread-scroll-to-bottom");
  await expect(button).toHaveCount(1);
  // 맨 아래에 있으면 버튼은 disabled라 invisible이지만 레이아웃 상자는 남는다.
  const geometry = await button.evaluate((element) => {
    const style = getComputedStyle(element);
    const icon = element.querySelector("svg")?.getBoundingClientRect();
    return {
      content: element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
      icon: icon ? { width: icon.width, height: icon.height } : null,
    };
  });
  expect(geometry.icon).toEqual({ width: 16, height: 16 });
  expect(geometry.content).toBeGreaterThanOrEqual(16);
});
