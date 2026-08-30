import { describe, expect, it } from "vitest";

import { assertImportScope, canonicalHash, transformRow } from "../../../scripts/operations/mongodb-import/transform.mjs";
import { readPage } from "../../../scripts/operations/mongodb-import/source.mjs";

describe("job asset import transform", () => {
  it("rejects user-owned and analysis tables", () => { expect(() => assertImportScope(["job_source", "job_analysis"])).toThrow(/unsupported/); expect(() => assertImportScope(["users"])).toThrow(/unsupported/); });
  it("preserves JSON, dates, raw text and requirement spans deterministically", () => {
    const runId = "11111111-1111-4111-8111-111111111111"; const source = { id: "22222222-2222-4222-8222-222222222222", job_posting_id: "33333333-3333-4333-8333-333333333333", order_no: 2, label: "Node.js 24", kind: "must", source_span: JSON.stringify({ start: 12, end: 22, text: "Node.js 24" }), extractor_version: 3, extracted_at: new Date("2026-08-09T01:02:03.123Z"), axis: "technology" };
    const one = transformRow("job_posting_requirement", source, runId); const two = transformRow("job_posting_requirement", source, runId);
    expect(one).toMatchObject({ _id: source.id, jobPostingId: source.job_posting_id, sourceSpan: { start: 12, end: 22, text: "Node.js 24" }, extractedAt: source.extracted_at, importRunId: runId }); expect(one.sourceHash).toBe(two.sourceHash); expect(canonicalHash(one)).toBe(canonicalHash(two));
  });
  it("stops on newly discovered source columns", () => { expect(() => transformRow("company", { id: "x", name: "Company", brand_colors: "[]", future_column: "unsafe" }, "run")).toThrow(/unmapped/); });
  it("binds only the cursor when MySQL rejects LIMIT placeholders", async () => {
    const execute = async (sql, values) => { expect(sql).toContain("limit 500"); expect(values).toEqual(["cursor"]); return [[{ id: "next" }]]; };
    await expect(readPage({ execute }, "job_source", "cursor", 500)).resolves.toEqual([{ id: "next" }]);
    await expect(readPage({ execute }, "job_source", "cursor", 0)).rejects.toThrow(/page size/);
  });
});
