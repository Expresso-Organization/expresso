import { randomUUID } from "node:crypto";

import type { Page } from "@playwright/test";

export const API_URL = `http://127.0.0.1:${process.env.CAREER_E2E_API_PORT ?? "4100"}`;

export async function login(page: Page, next = "/career/experience") {
  await page.goto(`/api/dev/session?next=${encodeURIComponent(next)}`);
  await page.waitForURL(`**${next}`);
}

export async function accessToken(page: Page): Promise<string> {
  const cookie = (await page.context().cookies()).find((item) => item.name === "ex_session");
  if (!cookie?.httpOnly || !cookie.value) throw new Error("httpOnly e2e session cookie is missing");
  return cookie.value;
}

export async function api<T>(page: Page, method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE", path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
  const response = await page.request.fetch(`${API_URL}${path}`, {
    method,
    headers: { authorization: `Bearer ${await accessToken(page)}`, accept: "application/json", ...(body === undefined ? {} : { "content-type": "application/json" }), ...headers },
    ...(body === undefined ? {} : { data: body }),
  });
  if (!response.ok()) throw new Error(`${method} ${path} failed: ${response.status()} ${await response.text()}`);
  return response.json() as Promise<T>;
}

export async function categories(page: Page) {
  return (await api<{ data: Array<{ id: string; key: string; name: string; version: number; propertySchemaV2: Array<{ id: string; key: string; name: string; type: string }> }> }>(page, "GET", "/v1/career/categories")).data;
}

export async function createRecord(page: Page, categoryId: string, title: string, properties: Record<string, unknown> = {}, bodyMd = "") {
  return (await api<{ data: { id: string; version: number; title: string } }>(page, "POST", "/v1/career/records", { categoryId, title, properties, bodyMd }, { "idempotency-key": `e2e-${randomUUID()}` })).data;
}

export async function openRecordDrawer(page: Page, title: string) {
  const row = page.getByRole("row").filter({ has: page.getByText(title, { exact: true }) }).first();
  const titleCell = row.getByRole("gridcell").nth(1);
  await titleCell.click();
}

/**
 * 편집기 블록을 모두 담은 본문입니다. 첫 bootstrap이 이 Markdown을 BlockNote 문서로 옮깁니다.
 * 콜아웃은 Markdown 문법이 없어 expresso-block 울타리로 적습니다.
 */
export function allBlockMarkdown(): string {
  const callout = JSON.stringify({ type: "callout", attrs: {}, text: [{ text: "호출" }] });
  return [
    "문단", "# 제목 1", "## 제목 2", "### 제목 3", "- 글머리", "1. 번호", "- [x] 할 일", "> 인용",
    "```typescript\nconst answer = 42\n```", `\`\`\`expresso-block\n${callout}\n\`\`\``, "---",
    "| 셀 | 값 |\n| --- | --- |\n| 셀 | 값 |",
  ].join("\n\n");
}

export async function createProperty(page: Page, category: { id: string; version: number }, property: { id: string; key: string; name: string; type: string; config: Record<string, unknown> }) {
  const change = { kind: "create", property: { ...property, required: false, system: false } };
  const preview = await api<{ data: { previewToken: string; categoryVersion: number } }>(page, "POST", `/v1/career/categories/${category.id}/property-schema/preview`, change);
  const applied = await api<{ data: { version: number } }>(page, "POST", `/v1/career/categories/${category.id}/property-schema/apply`, { change, previewToken: preview.data.previewToken, confirmLossy: false }, { "if-match": `"v${category.version}"`, "idempotency-key": `e2e-schema-${randomUUID()}` });
  category.version = applied.data.version;
}
