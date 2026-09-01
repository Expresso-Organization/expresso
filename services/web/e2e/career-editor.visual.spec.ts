import { expect, test } from "@playwright/test";

import { login } from "./fixtures";

test("matches the screen-definition layout at 375, 768, 1280 and 1440 widths", async ({ page }) => {
  await login(page);
  await page.goto("/career/experience");
  if (await page.getByRole("row").count() < 2) await page.getByRole("button", { name: "새로 만들기", exact: true }).click();
  else await page.getByRole("row").nth(1).click();
  await expect(page.getByLabel("커리어 문서 편집기")).toBeVisible();
  await expect(page.getByText("문서를 불러오고 있습니다.")).toHaveCount(0);
  await expect(page.getByRole("toolbar", { name: "빠른 필터" })).toBeVisible();
  for (const width of [375, 768, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByRole("complementary", { name: "문서 패널" })).toBeVisible();
    await expect(page.getByLabel("커리어 문서 편집기")).toBeVisible();
    await expect(page.getByText("문서를 불러오고 있습니다.")).toHaveCount(0);
    expect(await page.evaluate(() => ({ body: document.body.scrollWidth, viewport: window.innerWidth }))).toEqual({ body: width, viewport: width });
    const screenshot = await page.screenshot({
      fullPage: true, animations: "disabled",
      mask: [page.getByRole("button", { name: "Open Next.js Dev Tools" })],
      maskColor: "#F4F6FA",
    });
    expect(screenshot).toMatchSnapshot(`career-editor-${width}.png`, { maxDiffPixelRatio: 0.01 });
  }
});
