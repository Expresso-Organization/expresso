import { createHash, randomUUID } from "node:crypto";

import type { Page } from "@playwright/test";
import { encodeDocumentAsYUpdate, type CareerBlock, type CareerDocument } from "@expresso/editor";

export const API_URL = "http://127.0.0.1:4100";

export async function login(page: Page, next = "/career/experience") {
  await page.goto(`/api/dev/session?next=${encodeURIComponent(next)}`);
  await page.waitForURL(`**${next}`);
}

export async function accessToken(page: Page): Promise<string> {
  const cookie = (await page.context().cookies()).find((item) => item.name === "ex_session");
  if (!cookie?.httpOnly || !cookie.value) throw new Error("httpOnly e2e session cookie is missing");
  return cookie.value;
}

export async function api<T>(page: Page, method: "GET" | "POST" | "PATCH" | "PUT", path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
  const response = await page.request.fetch(`${API_URL}${path}`, {
    method,
    headers: { authorization: `Bearer ${await accessToken(page)}`, accept: "application/json", ...(body === undefined ? {} : { "content-type": "application/json" }), ...headers },
    ...(body === undefined ? {} : { data: body }),
  });
  if (!response.ok()) throw new Error(`${method} ${path} failed: ${response.status()} ${await response.text()}`);
  return response.json() as Promise<T>;
}

export async function categories(page: Page) {
  return (await api<{ data: Array<{ id: string; key: string; name: string; version: number; propertySchemaV2?: Array<{ id: string; key: string; type: string }> }> }>(page, "GET", "/v1/career/categories")).data;
}

export async function createRecord(page: Page, categoryId: string, title: string, properties: Record<string, unknown> = {}) {
  return (await api<{ data: { id: string; version: number; title: string } }>(page, "POST", "/v1/career/records", { categoryId, title, properties, bodyMd: "" }, { "idempotency-key": `e2e-${randomUUID()}` })).data;
}

const block = (type: string, text?: string, attrs: Record<string, unknown> = {}, content?: CareerBlock[]): CareerBlock => ({ id: randomUUID(), type, attrs, ...(text === undefined ? {} : { text: [{ text }] }), ...(content ? { content } : {}) });
export function allBlockDocument(): CareerDocument {
  const paragraph = (text: string) => block("paragraph", text);
  const listItem = (text: string, checked?: boolean) => block("listItem", undefined, checked === undefined ? {} : { checked }, [paragraph(text)]);
  const row = () => block("tableRow", undefined, {}, [block("tableCell", undefined, {}, [paragraph("셀")]), block("tableCell", undefined, {}, [paragraph("값")])]);
  return { schemaVersion: 1, type: "doc", content: [
    block("paragraph", "문단"), block("heading1", "제목 1"), block("heading2", "제목 2"), block("heading3", "제목 3"),
    block("bulletList", undefined, {}, [listItem("글머리")]), block("orderedList", undefined, {}, [listItem("번호")]),
    block("taskList", undefined, {}, [listItem("할 일", true)]), block("blockquote", undefined, {}, [paragraph("인용")]),
    block("code", "const answer = 42", { language: "typescript" }), block("callout", "호출"), block("horizontalRule"),
    block("image", undefined, { mediaId: randomUUID(), alt: "증빙 이미지" }), block("file", undefined, { mediaId: randomUUID(), name: "증빙.pdf" }),
    block("table", undefined, {}, [row(), row()]), block("evidence", "근거"), block("futureBlock", "미래 블록"),
  ] };
}

export async function replaceDocument(page: Page, recordId: string, document: CareerDocument) {
  const bootstrap = await api<{ document: CareerDocument; documentVersion: number }>(page, "GET", `/v1/career/records/${recordId}/document`);
  const update = encodeDocumentAsYUpdate(document, [encodeDocumentAsYUpdate(bootstrap.document)], `e2e:${randomUUID()}`);
  return api(page, "POST", `/v1/career/records/${recordId}/document/updates`, {
    clientId: randomUUID(), clientSequence: 1, expectedSequence: bootstrap.documentVersion,
    updateBase64: Buffer.from(update).toString("base64"), checksum: createHash("sha256").update(update).digest("hex"),
  });
}

export async function createProperty(page: Page, category: { id: string; version: number }, property: { id: string; key: string; name: string; type: string; config: Record<string, unknown> }) {
  const change = { kind: "create", property: { ...property, required: false, system: false } };
  const preview = await api<{ data: { previewToken: string; categoryVersion: number } }>(page, "POST", `/v1/career/categories/${category.id}/property-schema/preview`, change);
  const applied = await api<{ data: { version: number } }>(page, "POST", `/v1/career/categories/${category.id}/property-schema/apply`, { change, previewToken: preview.data.previewToken, confirmLossy: false }, { "if-match": `"v${category.version}"`, "idempotency-key": `e2e-schema-${randomUUID()}` });
  category.version = applied.data.version;
}
