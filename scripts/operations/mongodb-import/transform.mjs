import { createHash } from "node:crypto";

export const TABLE_ORDER = ["job_source", "company", "job_posting", "job_posting_requirement"];
export const COLUMN_POLICY = {
  job_source: { stored: ["id", "provider", "token", "display_name", "is_active", "last_run_at", "last_status", "last_error", "last_seen_count", "last_added_count", "created_at", "site_url"], excluded: {} },
  company: { stored: ["id", "name", "domain", "industry", "tone_summary", "dedupe_key", "tone_palette", "avatar_background", "avatar_color", "brand_colors", "tone_impression", "initial", "logo_data", "logo_media_type", "logo_source_url", "logo_checksum", "logo_read_at"], excluded: {} },
  job_posting: { stored: ["id", "company_id", "source", "external_id", "title", "description_raw", "requirements", "expires_at", "dedupe_hash", "source_url", "created_at", "normalized_at", "location", "work_type", "experience_label", "employment_type", "salary_note", "job_family", "duties", "preferred", "hiring_process", "process_note", "notice", "team", "deadline_note", "source_board", "location_region", "experience_note", "facts_read_at", "experience_min_years"], excluded: {} },
  job_posting_requirement: { stored: ["id", "job_posting_id", "order_no", "label", "kind", "source_span", "extractor_version", "extracted_at", "axis"], excluded: {} },
};
export const TARGET_COLLECTION = { job_source: "job_sources", company: "companies", job_posting: "job_postings", job_posting_requirement: "job_posting_requirements" };

const JSON_COLUMNS = new Set(["tone_palette", "brand_colors", "requirements", "duties", "preferred", "hiring_process", "source_span"]);
const DATE_COLUMNS = new Set(["last_run_at", "created_at", "logo_read_at", "expires_at", "normalized_at", "facts_read_at", "extracted_at"]);
const BOOLEAN_COLUMNS = new Set(["is_active"]);
const camel = (key) => key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
function normalize(value) {
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return value.toString("base64");
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, normalize(value[key])]));
  return value;
}
export function canonicalHash(value) { return createHash("sha256").update(JSON.stringify(normalize(value))).digest("hex"); }

export function assertImportScope(tables) {
  const unexpected = tables.filter((table) => !TABLE_ORDER.includes(table));
  if (unexpected.length) throw new Error(`unsupported import table: ${unexpected.join(",")}`);
}

export function transformRow(table, source, importRunId) {
  assertImportScope([table]); const policy = COLUMN_POLICY[table]; const unknown = Object.keys(source).filter((key) => !policy.stored.includes(key) && !(key in policy.excluded));
  if (unknown.length) throw new Error(`${table} has unmapped source columns: ${unknown.join(",")}`);
  const doc = { _id: String(source.id), importRunId };
  for (const key of policy.stored) {
    if (key === "id" || source[key] === undefined) continue; let value = source[key];
    if (JSON_COLUMNS.has(key) && typeof value === "string") value = JSON.parse(value);
    if (DATE_COLUMNS.has(key) && value !== null) value = new Date(value);
    if (BOOLEAN_COLUMNS.has(key)) value = Boolean(value);
    if (key === "logo_data" && value !== null && !Buffer.isBuffer(value)) value = Buffer.from(value);
    doc[camel(key)] = value;
  }
  doc.sourceHash = canonicalHash(Object.fromEntries(policy.stored.map((key) => [key, source[key] ?? null])));
  return doc;
}
