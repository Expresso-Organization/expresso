import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import { allBlockDocument, api, categories, createProperty, createRecord, login, openRecordDrawer, replaceDocument } from "./fixtures";

test.describe.configure({ mode: "serial" });

test("creates, edits, reloads, reconnects and reviews AI changes across side peek and full page", async ({ page, context }) => {
  await login(page);
  const categoryList = await categories(page);
  const experience = categoryList.find((item) => item.key === "experience")!;
  const project = categoryList.find((item) => item.key === "project")!;
  const record = await createRecord(page, experience.id, "E2E 전체 블록 경험");
  await replaceDocument(page, record.id, allBlockDocument());
  await page.goto("/career/experience");
  await openRecordDrawer(page, "E2E 전체 블록 경험");
  const editor = page.getByLabel("커리어 기록 본문");
  await expect(editor.getByRole("heading", { name: "제목 1" })).toBeVisible();
  await expect(editor.locator("ul:not([data-type=taskList])").first()).toContainText("글머리");
  await expect(editor.locator("ol")).toContainText("번호");
  await expect(editor.locator("ul[data-type=taskList]")).toContainText("할 일");
  await expect(editor.locator("blockquote")).toContainText("인용");
  await expect(editor.locator("pre")).toContainText("const answer = 42");
  await expect(editor.locator("hr")).toHaveCount(1);
  await expect(editor.locator("table")).toContainText("셀");
  await expect(editor.getByRole("note")).toHaveCount(4);

  const title = page.getByRole("textbox", { name: "제목", exact: true });
  await title.fill("E2E 저장된 경험");
  await Promise.all([page.waitForResponse((response) => response.url().includes(`/api/career/records/${record.id}`) && response.request().method() === "PATCH" && response.ok()), title.blur()]);
  await editor.click(); await page.keyboard.press("ControlOrMeta+A"); await page.keyboard.type("재연결 전 본문");
  await expect.poll(async () => JSON.stringify((await api<{ document: unknown }>(page, "GET", `/v1/career/records/${record.id}/document`)).document).includes("재연결 전 본문")).toBe(true);
  await page.reload();
  await openRecordDrawer(page, "E2E 저장된 경험");
  await expect(page.getByRole("textbox", { name: "제목", exact: true })).toHaveValue("E2E 저장된 경험");
  await expect(page.getByLabel("커리어 기록 본문")).toContainText("재연결 전 본문");

  const beforeOffline = await api<{ documentVersion: number }>(page, "GET", `/v1/career/records/${record.id}/document`);
  await context.setOffline(true);
  await page.getByLabel("커리어 기록 본문").click(); await page.keyboard.press("End"); await page.keyboard.type(" 오프라인 입력");
  await context.setOffline(false);
  await expect.poll(async () => { const current = await api<{ documentVersion: number; document: unknown }>(page, "GET", `/v1/career/records/${record.id}/document`); return current.documentVersion > beforeOffline.documentVersion && JSON.stringify(current.document).includes("오프라인 입력"); }, { timeout: 15_000 }).toBe(true);
  await page.reload();
  await openRecordDrawer(page, "E2E 저장된 경험");
  await expect(page.getByLabel("커리어 기록 본문")).toContainText("오프라인 입력");

  await page.getByLabel("커리어 기록 본문").click(); await page.keyboard.press("ControlOrMeta+End"); await page.keyboard.press("Enter"); await page.keyboard.type("/");
  const slash = page.getByRole("menu", { name: "블록 명령" });
  await expect(slash.getByRole("menuitem")).toHaveCount(9);
  await page.keyboard.press("ArrowDown"); await page.keyboard.press("Escape");
  await expect(slash).toBeHidden();
  await expect(editor).toBeFocused();

  await page.getByLabel("AI에게 편집 요청").fill("문장 다듬기");
  await page.getByRole("button", { name: "제안 만들기" }).click();
  await expect(page.getByLabel("AI 제안 변경 목록")).toBeVisible();
  await page.getByRole("button", { name: /개 변경 적용/ }).click();
  await expect(page.getByRole("button", { name: "변경 되돌리기" })).toBeVisible();
  await page.getByRole("button", { name: "변경 되돌리기" }).click();
  await page.getByRole("button", { name: "되돌리기 확인" }).click();
  await expect(page.getByRole("button", { name: /개 변경 적용/ })).toBeVisible();

  await page.getByRole("button", { name: "넓게 보기" }).click();
  await expect(page).toHaveURL(new RegExp(`/career/records/${record.id}$`));
  await expect(page.getByLabel("커리어 기록 본문")).toBeVisible();
  await page.goBack();

  await openRecordDrawer(page, "E2E 저장된 경험");
  await api(page, "POST", `/v1/career/records/${record.id}/move/preview`, { targetCategoryId: project.id });
  await page.getByRole("button", { name: "카테고리 이동" }).click();
  await page.getByRole("button", { name: "옮길 카테고리" }).click();
  await page.getByRole("option", { name: project.name, exact: true }).click();
  const moveResponse = page.waitForResponse((response) => response.url().includes(`/api/career/records/${record.id}/move/preview`));
  await page.getByRole("button", { name: "영향 확인" }).click(); expect((await moveResponse).ok()).toBe(true);
  await expect(page.getByText("본문과 관계는 그대로 유지됩니다.")).toBeVisible();
  const applyResponse = page.waitForResponse((response) => response.url().endsWith(`/api/career/records/${record.id}/move`) && response.request().method() === "POST");
  await page.getByRole("button", { name: "이동 적용" }).click();
  const appliedMove = await applyResponse;
  expect(appliedMove.status()).toBe(200);
  const moved = await api<{ data: { categoryId: string } }>(page, "GET", `/v1/career/records/${record.id}`);
  expect(moved.data.categoryId).toBe(project.id);
});

test("renders every property family, five saved views and relation hydration", async ({ page }) => {
  await login(page);
  const key = `e2e_properties_${randomUUID().replaceAll("-", "")}`;
  const created = await api<{ data: { id: string; version: number } }>(page, "POST", "/v1/career/categories", { key, name: "E2E 속성", icon: "folder", defaultView: "table", propertySchema: {} });
  const category = { id: created.data.id, version: created.data.version };
  const ids = Object.fromEntries(["text", "number", "select", "multi_select", "date", "checkbox", "url", "email", "phone", "file", "media", "relation", "formula", "rollup", "created_time", "updated_time"].map((type) => [type, randomUUID()]));
  const option = randomUUID();
  for (const type of ["text", "number", "select", "multi_select", "date", "checkbox", "url", "email", "phone", "file", "media", "created_time", "updated_time"] as const) {
    const config = type === "select" || type === "multi_select" ? { options: [{ id: option, name: "선택 A" }] } : {};
    await createProperty(page, category, { id: ids[type]!, key: `field_${type}`, name: `${type} 1`, type, config });
  }
  await createProperty(page, category, { id: ids.relation!, key: "field_relation", name: "relation 1", type: "relation", config: { targetCategoryId: category.id, inversePropertyId: null, cardinality: "multiple", deletePolicy: "nullify" } });
  await createProperty(page, category, { id: ids.formula!, key: "field_formula", name: "formula 1", type: "formula", config: { source: "1 + 2", ast: null, diagnostics: [] } });
  await createProperty(page, category, { id: ids.rollup!, key: "field_rollup", name: "rollup 1", type: "rollup", config: { relationPropertyId: ids.relation, targetPropertyId: ids.number, aggregation: "sum" } });
  const visible = Object.values(ids);
  const viewBody = (type: "table" | "list" | "gallery" | "board" | "timeline") => ({ name: `E2E ${type}`, type, filter: null, sorts: [], groupPropertyId: null, groupOrder: [], visiblePropertyIds: visible, propertyOrder: visible, columnWidths: {}, gallery: type === "gallery" ? { coverPropertyId: null, previewPropertyIds: [ids.text] } : null, board: type === "board" ? { hiddenGroupIds: [], cardOrder: {} } : null, timeline: type === "timeline" ? { startPropertyId: ids.date, endPropertyId: null, axisStart: null, axisEnd: null } : null });
  for (const type of ["table", "list", "gallery", "board", "timeline"] as const) await api(page, "POST", `/v1/career/categories/${category.id}/view-configurations`, viewBody(type), { "if-match": `"v${category.version}"` });
  const target = await createRecord(page, category.id, "관계 대상", { field_number: { type: "number", value: 2 } });
  const record = await createRecord(page, category.id, "모든 속성", {
    field_text: { type: "text", value: "텍스트" }, field_number: { type: "number", value: 3 }, field_select: { type: "select", value: option }, field_multi_select: { type: "multi_select", value: [option] },
    field_date: { type: "date", value: { start: "2026-09-01", end: null, timezone: null } }, field_checkbox: { type: "checkbox", value: true }, field_url: { type: "url", value: "https://example.com" }, field_email: { type: "email", value: "e2e@example.com" }, field_phone: { type: "phone", value: "+82-10-0000-0000" }, field_file: { type: "file", value: [randomUUID()] }, field_media: { type: "media", value: [randomUUID()] }, field_created_time: { type: "created_time", value: "2026-09-01T00:00:00.000Z" }, field_updated_time: { type: "updated_time", value: "2026-09-01T01:00:00.000Z" },
  });
  await api(page, "PUT", `/v1/career/records/${record.id}/relations`, { propertyId: ids.relation, targetIds: [target.id] }, { "if-match": `"v${record.version}"` });
  await expect.poll(async () => (await api<{ data: { computedProperties?: Record<string, { value: unknown }> } }>(page, "GET", `/v1/career/records/${record.id}`)).data.computedProperties?.field_formula?.value).toBe(3);
  await expect.poll(async () => (await api<{ data: { computedProperties?: Record<string, { value: unknown }> } }>(page, "GET", `/v1/career/records/${record.id}`)).data.computedProperties?.field_rollup?.value).toBe(2);
  expect((await api<{ data: unknown[] }>(page, "GET", `/v1/career/categories/${category.id}/view-configurations`)).data).toHaveLength(5);
  await page.goto(`/career/${key}`);
  await openRecordDrawer(page, "모든 속성");
  const propertyList = page.getByLabel("문서 속성");
  for (const type of Object.keys(ids)) await expect(propertyList.getByText(`${type} 1`, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "관계 대상 ×" })).toBeVisible();
  await expect(propertyList.getByText("3", { exact: true })).toBeVisible();
  await expect(propertyList.getByText("2", { exact: true })).toBeVisible();
  const customTime = propertyList.getByLabel("created_time 1", { exact: true });
  await expect(customTime).toHaveAttribute("placeholder", "YYYY-MM-DD HH:mm");
  const timestampSave = page.waitForResponse((response) => response.url().includes(`/api/career/records/${record.id}`) && response.request().method() === "PATCH" && response.ok());
  await customTime.fill("2026-09-02 14:30");
  await timestampSave;
  await expect(page.getByRole("tab")).toHaveCount(5);

  await propertyList.getByRole("button", { name: "속성 추가", exact: true }).click();
  const propertyPopover = page.getByLabel("속성 추가", { exact: true });
  await expect(propertyPopover).toBeVisible();
  await expect(page.getByText("속성 관리", { exact: true })).toHaveCount(0);
  await propertyPopover.getByLabel("속성 이름", { exact: true }).fill("팝오버 생성 속성");
  await propertyPopover.getByRole("option", { name: "텍스트", exact: true }).click();
  await expect(propertyList.getByText("팝오버 생성 속성", { exact: true })).toBeVisible();
  await expect(propertyPopover).toBeHidden();
});

test("keeps legacy page and API while v2 routes stay closed when the flag is false", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: "http://127.0.0.1:3101" });
  const page = await context.newPage();
  await page.goto("/api/dev/session?next=%2Fcareer%2Fexperience");
  await page.waitForURL("**/career/experience");
  await expect(page.locator('[data-career-editor="legacy"]')).toBeVisible();
  await expect(page.getByLabel("기존 커리어 목록")).toBeVisible();
  await expect(page.getByLabel("커리어 문서 편집기")).toHaveCount(0);
  const token = (await context.cookies()).find((cookie) => cookie.name === "ex_session")!.value;
  const legacy = await page.request.get("http://127.0.0.1:4101/v1/career/categories", { headers: { authorization: `Bearer ${token}` } });
  expect(legacy.ok()).toBe(true);
  const v2 = await page.request.get(`http://127.0.0.1:4101/v1/career/records/${randomUUID()}/document`, { headers: { authorization: `Bearer ${token}` } });
  expect(v2.status()).toBe(404);
  await context.close();
});
