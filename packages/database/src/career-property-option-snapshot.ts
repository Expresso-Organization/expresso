import { createHash } from "node:crypto";
import { UuidSchema, type CareerPropertyDefinitionV2 } from "@expresso/contracts";
import type { CareerPropertyOptionDoc } from "./documents/career-property-option.js";
import type { CareerPropertyMutationDoc } from "./documents/career-property-mutation.js";
import { canonicalCareerTagOptionId, overlayCareerPropertyOptions, type CareerCategoryPropertyOptionScope } from "./career-property-options.js";

export interface CareerPropertyOptionPolicy {
  userId: string; categoryId: string; propertyId: string; optionId: string; rawLabel: string; version: 1;
}
export interface CareerPropertyOptionSnapshot {
  privateOptionSnapshotJson: string; privateOptionSnapshotFingerprint: string;
}
const invalid = () => new Error("CAREER_PRIVATE_OPTIONS_SNAPSHOT_INVALID");
function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value !== null && typeof value === "object") return "{" + Object.keys(value).sort().map(key => JSON.stringify(key) + ":" + canonical((value as Record<string, unknown>)[key])).join(",") + "}";
  return JSON.stringify(value);
}
function compare(left: CareerPropertyOptionPolicy, right: CareerPropertyOptionPolicy): number {
  for (const key of ["propertyId", "rawLabel", "optionId"] as const) if (left[key] !== right[key]) return left[key] < right[key] ? -1 : 1;
  return 0;
}
function validate(rows: unknown, scope: CareerCategoryPropertyOptionScope, definitions: readonly CareerPropertyDefinitionV2[], strict: boolean, propertyId?: string): CareerPropertyOptionPolicy[] {
  if (!UuidSchema.safeParse(scope.userId).success || !UuidSchema.safeParse(scope.categoryId).success || !Array.isArray(rows)) throw invalid();
  const known = new Set(definitions.map(definition => definition.id)), labels = new Set<string>(), ids = new Set<string>();
  return rows.map(row => {
    if (!row || typeof row !== "object" || Array.isArray(row)) throw invalid();
    const value = row as Record<string, unknown>;
    if (strict && Object.keys(value).sort().join(",") !== "categoryId,optionId,propertyId,rawLabel,userId,version") throw invalid();
    if (value.userId !== scope.userId || value.categoryId !== scope.categoryId || typeof value.propertyId !== "string" || !known.has(value.propertyId) || (propertyId !== undefined && value.propertyId !== propertyId) || !UuidSchema.safeParse(value.propertyId).success || !UuidSchema.safeParse(value.optionId).success || typeof value.rawLabel !== "string" || value.rawLabel.length > 200 || value.version !== 1) throw invalid();
    const labelKey = value.propertyId + "\0" + value.rawLabel, idKey = value.propertyId + "\0" + value.optionId;
    if (labels.has(labelKey) || ids.has(idKey)) throw invalid();
    labels.add(labelKey); ids.add(idKey);
    return { userId: scope.userId, categoryId: scope.categoryId, propertyId: value.propertyId, optionId: value.optionId as string, rawLabel: value.rawLabel, version: 1 };
  });
}
/** 표시용 BSON metadata는 원본에 남기고 변환에 필요한 의미만 고정합니다. */
export function prepareCareerPropertyOptionSnapshot(rows: readonly CareerPropertyOptionDoc[], scope: CareerCategoryPropertyOptionScope, definitions: readonly CareerPropertyDefinitionV2[]): CareerPropertyOptionSnapshot {
  const policy = validate(rows, scope, definitions, false).sort(compare);
  const privateOptionSnapshotJson = canonical(policy);
  if (Buffer.byteLength(privateOptionSnapshotJson, "utf8") > 2_097_152) throw invalid();
  return { privateOptionSnapshotJson, privateOptionSnapshotFingerprint: createHash("sha256").update(privateOptionSnapshotJson, "utf8").digest("hex") };
}
/** raw plan과 fingerprint를 유지하며 같은 사용자의 고정된 옵션만 읽습니다. */
export function readCareerPropertyOptionSnapshot(job: Pick<CareerPropertyMutationDoc, "userId" | "categoryId" | "propertyId" | "privateOptionSnapshotJson" | "privateOptionSnapshotFingerprint">, definitions: readonly CareerPropertyDefinitionV2[], requiresPrivateOptions = false): CareerPropertyOptionPolicy[] {
  const { privateOptionSnapshotJson: json, privateOptionSnapshotFingerprint: fingerprint } = job;
  if (json === undefined && fingerprint === undefined) {
    if (requiresPrivateOptions || definitions.some(definition => definition.id === job.propertyId && ["select", "multi_select"].includes(definition.type) && definition.config.legacyFreeformTags === true)) throw new Error("CAREER_PRIVATE_OPTIONS_SNAPSHOT_REQUIRED");
    return [];
  }
  if (typeof json !== "string" || typeof fingerprint !== "string" || !/^[a-f0-9]{64}$/.test(fingerprint) || Buffer.byteLength(json, "utf8") > 2_097_152 || createHash("sha256").update(json, "utf8").digest("hex") !== fingerprint) throw invalid();
  let parsed: unknown;
  try { parsed = JSON.parse(json); } catch { throw invalid(); }
  const policy = validate(parsed, job, definitions, true, job.propertyId);
  if (canonical([...policy].sort(compare)) !== json) throw invalid();
  return policy;
}
export function overlayCareerPropertyOptionSnapshot(definitions: readonly CareerPropertyDefinitionV2[], snapshot: readonly CareerPropertyOptionPolicy[], scope: CareerCategoryPropertyOptionScope): CareerPropertyDefinitionV2[] {
  const policy = validate(snapshot, scope, definitions, true);
  return overlayCareerPropertyOptions(definitions, policy.map(row => ({ ...row, _id: canonicalCareerTagOptionId(row.userId, row.categoryId, row.propertyId, row.rawLabel), createdAt: new Date(0) })), scope);
}