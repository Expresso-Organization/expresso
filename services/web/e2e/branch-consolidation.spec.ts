import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { api, createProperty, createRecord, login, openRecordDrawer } from "./fixtures";

test("경력 표의 제목 내 선택, 필터, 합계와 452px 패널을 실제 API로 확인한다", async ({ page }) => {
  await login(page);
  const key = `e2e_summary_${randomUUID().replaceAll("-", "")}`;
  const { data: category } = await api<{ data: { id: string; version: number } }>(page, "POST", "/v1/career/categories", { key, name: "집계 확인", icon: "folder", defaultView: "table" });
  const scoreId = randomUUID();
  await createProperty(page, category, { id: scoreId, key: "score", name: "점수", type: "number", config: {} });
  await createRecord(page, category.id, "집계 기록 A", { score: { type: "number", value: 2 } });
  const second = await createRecord(page, category.id, "집계 기록 B", { score: { type: "number", value: 3 } });
  await api(page, "PATCH", `/v1/career/records/${second.id}`, { status: "verified" }, { "if-match": `"v${second.version}"` });
  await page.goto(`/career/${key}`);
  await page.getByRole("button", { name: "합계 계산", exact: true }).click();
  await expect(page.getByRole("gridcell", { name: "합계 5", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "초안 1", exact: true }).click();
  await expect(page.getByRole("gridcell", { name: "합계 2", exact: true })).toBeVisible();
  await expect(page.getByRole("gridcell", { name: "집계 기록 B", exact: true })).toHaveCount(0);
  const checkbox = page.getByRole("checkbox", { name: "집계 기록 A 선택" });
  await checkbox.focus(); await page.keyboard.press("Space");
  await expect(checkbox).toBeChecked();
  await expect(page.getByRole("gridcell", { name: "집계 기록 A", exact: true })).toContainText("집계 기록 A");
  await page.screenshot({ path: "/tmp/expresso-consolidation-qa/product-career-summary.png", fullPage: true });
  await openRecordDrawer(page, "집계 기록 A");
  await expect(page.getByRole("separator", { name: "문서 패널 너비 조절" })).toHaveAttribute("aria-valuenow", "452");
  await expect(page.getByLabel("커리어 문서 편집기")).toBeVisible();
  await expect(page.getByText("문서를 불러오고 있습니다.")).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.screenshot({ path: "/tmp/expresso-consolidation-qa/product-career-drawer.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel("문서 패널", { exact: true })).toBeVisible();
  const bounds = await page.getByLabel("문서 패널", { exact: true }).boundingBox();
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(391);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: "/tmp/expresso-consolidation-qa/product-career-mobile.png", fullPage: true });
});

test("검색 도중 조건을 유지하고 지연·빈 결과를 안내한다", async ({ page }) => {
  await login(page, "/jobs");
  await page.route("**/jobs?**", async (route) => {
    if (new URL(route.request().url()).searchParams.has("q")) await new Promise((resolve) => setTimeout(resolve, 5_500));
    await route.continue();
  });
  await page.getByRole("textbox", { name: "공고 검색", exact: true }).fill("zzzz없는공고검증");
  await page.getByRole("button", { name: "찾기", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "입력한 조건으로 공고를" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "공고 검색", exact: true })).toHaveValue("zzzz없는공고검증");
  await expect(page.getByRole("status").filter({ hasText: "검색이 조금 길어지고" })).toBeVisible({ timeout: 8_000 });
  await page.screenshot({ path: "/tmp/expresso-consolidation-qa/product-search-slow.png", fullPage: true });
  await expect(page.getByRole("heading", { name: "조건에 맞는 공고가 없습니다" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "중지", exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "전체 공고 보기" }).click();
  await expect(page).toHaveURL(/\/jobs$/);
});
