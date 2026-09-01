import { canonicalHash, TARGET_COLLECTION, TABLE_ORDER, transformRow } from "./transform.mjs";
import { readPage } from "./source.mjs";

export async function verifyImport(connection, db, runId, pageSize = 500) {
  const report = { counts: {}, mismatches: [] };
  for (const table of TABLE_ORDER) {
    let after = ""; let count = 0; const target = db.collection(TARGET_COLLECTION[table]);
    while (true) { const rows = await readPage(connection, table, after, pageSize); if (!rows.length) break; for (const source of rows) { const expected = transformRow(table, source, runId); const actual = await target.findOne({ _id: expected._id }); if (!actual || actual.sourceHash !== expected.sourceHash) report.mismatches.push({ table, id: expected._id, field: "sourceHash", reason: actual ? "content differs" : "missing" }); count += 1; after = source.id; } }
    const imported = await target.countDocuments({ importRunId: runId }); report.counts[table] = { source: count, target: imported }; if (count !== imported) report.mismatches.push({ table, id: "*", field: "count", reason: `${count}/${imported}` });
  }
  const postingIds = new Set((await db.collection("job_postings").find({ importRunId: runId }).project({ _id: 1 }).toArray()).map(({ _id }) => _id)); const companyIds = new Set((await db.collection("companies").find({ importRunId: runId }).project({ _id: 1 }).toArray()).map(({ _id }) => _id));
  for (const posting of await db.collection("job_postings").find({ importRunId: runId }).toArray()) if (!companyIds.has(posting.companyId)) report.mismatches.push({ table: "job_posting", id: posting._id, field: "companyId", reason: "missing reference" });
  for (const requirement of await db.collection("job_posting_requirements").find({ importRunId: runId }).toArray()) if (!postingIds.has(requirement.jobPostingId)) report.mismatches.push({ table: "job_posting_requirement", id: requirement._id, field: "jobPostingId", reason: "missing reference" });
  report.hash = canonicalHash(report.counts); return report;
}
