import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { CareerRecordResponseSchema } from "@expresso/contracts";

// 실제 UI가 캐시한 v1 위로 다른 HTTP 작성자가 v2를 저장한 뒤 같은 셀을 편집합니다.
export async function probeWebCellConflict({ page, db, collections, category, propertyId, userId, expect }) {
  const expected = process.env.B2_SMOKE_CELL_CONFLICT_EXPECTED ?? "preserved";
  assert.ok(["overwrite", "preserved"].includes(expected));
  const title = "HTTP stale cell " + randomUUID();
  const createdResponse = await page.request.post("/api/career/records", {
    headers: { "idempotency-key": "cell-conflict-create-" + randomUUID() },
    data: { categoryId: category.id, title, propertyValues: [{ propertyDefinitionId: propertyId, type: "number", value: "10.0000" }], bodyMd: "" },
  });
  assert.equal(createdResponse.status(), 200);
  const created = CareerRecordResponseSchema.parse(await createdResponse.json()).data;
  assert.equal(created.version, 1);
  const path = "/api/career/records/" + created.id;
  await page.reload();
  const row = page.getByRole("row").filter({ has: page.getByText(title, { exact: true }) }).first();
  const cell = row.getByRole("gridcell", { name: "10.0000", exact: true });
  await expect(cell).toBeVisible();
  const newerResponse = await page.request.patch(path, {
    headers: { "if-match": '"v1"', "idempotency-key": "cell-conflict-newer-" + randomUUID() },
    data: { propertyValues: { set: [{ propertyDefinitionId: propertyId, type: "number", value: "20.0000" }], unsetPropertyIds: [] } },
  });
  assert.equal(newerResponse.status(), 200);
  const newer = CareerRecordResponseSchema.parse(await newerResponse.json()).data;
  assert.equal(newer.version, 2);
  const beforeStale = await collections.careerRecords.findOne({ _id: created.id, userId });
  assert.equal(beforeStale.propertyValues.find(value => value.propertyDefinitionId === propertyId).value.toString(), "20.0000");
  const beforeReceipts = await db.collection("career_command_idempotency").find({ userId }).sort({ _id: 1 }).toArray();
  const beforeOutbox = await collections.outboxEvents.find({ userId, "payload.recordId": created.id }).sort({ _id: 1 }).toArray();
  const browserWrites = [];
  const capture = response => {
    const request = response.request();
    if (response.url().endsWith(path) && request.method() === "PATCH") browserWrites.push({
      status: response.status(), ifMatch: request.headers()["if-match"],
      key: request.headers()["idempotency-key"], patch: request.postDataJSON(),
    });
  };
  page.on("response", capture);
  try {
    await cell.focus(); await cell.press("F2");
    const input = page.getByRole("textbox", { name: "Exact amount 셀 편집", exact: true });
    await expect(input).toHaveValue("10.0000");
    await input.fill("30.0000");
    const staleResponse = page.waitForResponse(response => response.url().endsWith(path) && response.request().method() === "PATCH");
    await input.press("Enter");
    assert.equal((await staleResponse).status(), 412);
    if (expected === "overwrite") {
      await expect.poll(async () => {
        const raw = await collections.careerRecords.findOne({ _id: created.id, userId });
        return raw.propertyValues.find(value => value.propertyDefinitionId === propertyId).value.toString();
      }).toBe("30.0000");
      await expect.poll(() => browserWrites.length).toBe(2);
      assert.deepEqual(browserWrites.map(write => write.status), [412, 200]);
      assert.deepEqual(browserWrites.map(write => write.ifMatch), ['"v1"', '"v2"']);
      assert.deepEqual(browserWrites[0].patch, browserWrites[1].patch);
      assert.notEqual(browserWrites[0].key, browserWrites[1].key);
    } else {
      const freshCell = row.getByRole("gridcell", { name: "20.0000", exact: true });
      await expect(freshCell).toHaveAttribute("data-issue", "true");
      assert.equal(browserWrites.length, 1);
      assert.match(await freshCell.getAttribute("title"), /충돌/);
      assert.deepEqual(await collections.careerRecords.findOne({ _id: created.id, userId }), beforeStale);
    }
    const after = await collections.careerRecords.findOne({ _id: created.id, userId });
    const afterReceipts = await db.collection("career_command_idempotency").find({ userId }).sort({ _id: 1 }).toArray();
    const afterOutbox = await collections.outboxEvents.find({ userId, "payload.recordId": created.id }).sort({ _id: 1 }).toArray();
    assert.equal(after.version, expected === "overwrite" ? 3 : 2);
    assert.deepEqual(afterReceipts, beforeReceipts);
    assert.equal(afterOutbox.length, beforeOutbox.length + (expected === "overwrite" ? 1 : 0));
    assert.deepEqual(afterOutbox.filter(event => beforeOutbox.some(prior => prior._id === event._id)), beforeOutbox);
    return { scenario: "real-http-stale-cell", outcome: expected, statuses: browserWrites.map(write => write.status), ifMatch: browserWrites.map(write => write.ifMatch), newRetryKey: browserWrites.length === 2 && browserWrites[0].key !== browserWrites[1].key, storedVersion: after.version, storedValue: after.propertyValues.find(value => value.propertyDefinitionId === propertyId).value.toString(), writerReceiptsUnchanged: true, extraWriterOutboxEvents: afterOutbox.length - beforeOutbox.length };
  } finally {
    page.off("response", capture);
  }
}
