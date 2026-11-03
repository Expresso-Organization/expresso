import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import { api, createRecord, login } from "./fixtures";

// 새 카테고리를 만들어 사이드바를 바꾸므로, 파일 이름 순서상 시각 비교(career-editor.visual) 뒤에 돕니다.
test("scrolls a long full-page record, shows the selection AI menu and reaches the 60th table row", async ({ page }) => {
  await login(page);
  const key = `e2e_long_${randomUUID().replaceAll("-", "")}`;
  const created = await api<{ data: { id: string } }>(page, "POST", "/v1/career/categories", { key, name: "E2E 긴 목록", icon: "folder", defaultView: "table" });
  const body = Array.from({ length: 60 }, (_, index) => `긴 본문 문단 ${index + 1}`).join("\n\n");
  const record = await createRecord(page, created.data.id, "긴 본문 기록", {}, body);
  for (let index = 1; index <= 59; index += 1) await createRecord(page, created.data.id, `목록 기록 ${index}`);

  // 전체 페이지는 본문이 길어도 휠로 내려가야 합니다(감사 H2).
  await page.goto(`/career/records/${record.id}`);
  const editor = page.getByLabel("커리어 기록 본문");
  await expect(editor).toContainText("긴 본문 문단 60");
  const editorTop = () => editor.evaluate((element) => element.getBoundingClientRect().top);
  const before = await editorTop();
  await editor.hover();
  await page.mouse.wheel(0, 4000);
  await expect.poll(editorTop).toBeLessThan(before - 100);

  // 선택 영역 AI 메뉴는 서식 툴바에 잘리지 않고 화면에 보여야 합니다(감사 H3).
  const lastParagraph = editor.getByText("긴 본문 문단 60", { exact: true });
  await lastParagraph.scrollIntoViewIfNeeded();
  await lastParagraph.dblclick();
  await page.getByRole("button", { name: "AI 편집" }).click();
  const aiMenu = page.getByRole("menu", { name: "선택 영역 AI 편집" });
  await expect(aiMenu).toBeInViewport();
  await page.keyboard.press("Escape");
  await expect(aiMenu).toBeHidden();

  // 표는 화면에 그리는 행을 줄여도 60번째 기록까지 내려가 보여야 합니다.
  await page.goto(`/career/${key}`);
  await expect(page.getByText("목록 기록 59", { exact: true })).toBeVisible();
  // 먼저 만든 기록이 맨 아래 60번째 행입니다.
  const last = page.getByRole("row").filter({ has: page.getByText("긴 본문 기록", { exact: true }) });
  await expect.poll(async () => {
    await page.getByRole("row").nth(3).hover();
    await page.mouse.wheel(0, 1500);
    return last.isVisible();
  }, { timeout: 15_000 }).toBe(true);
});
