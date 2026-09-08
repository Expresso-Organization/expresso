import { isDeepStrictEqual } from "node:util";

import type { Db, Document } from "mongodb";

const MIGRATION_BATCH_SIZE = 100;

function isDocument(value: unknown): value is Document {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** document write 뒤 journal 갱신 전에 중단된 migration을 사용자 변경 없이 복구합니다. */
export async function reconcilePlannedDocumentJournals(
  db: Db,
  journalCollection: string,
  migration: string,
): Promise<void> {
  const journals = db.collection<Document & { _id: string }>(journalCollection);
  const cursor = journals.find({
    migration,
    state: "planned",
    $or: [{ kind: "document" }, { kind: { $exists: false } }],
  }).batchSize(MIGRATION_BATCH_SIZE);
  for await (const entry of cursor) {
    const collectionName = entry["collection"];
    const documentId = entry["documentId"];
    const before = entry["before"];
    const after = entry["after"];
    if (typeof collectionName !== "string" || typeof documentId !== "string" || !isDocument(before) || !isDocument(after)) {
      throw new Error(`${migration} journal recovery conflict: ${entry._id}의 복구 정보가 올바르지 않습니다.`);
    }

    const current = await db.collection<Document>(collectionName).findOne({ _id: before["_id"] });
    if (current && isDeepStrictEqual(current, after)) {
      const result = await journals.updateOne({ _id: entry._id, state: "planned" }, { $set: { state: "applied" } });
      if (result.modifiedCount !== 1) {
        throw new Error(`${migration} journal recovery conflict: ${entry._id} 상태가 동시에 변경되었습니다.`);
      }
      continue;
    }
    if (current && isDeepStrictEqual(current, before)) continue;
    throw new Error(`${migration} journal recovery conflict: ${collectionName}/${documentId}에 migration 이후 사용자 변경이 있습니다.`);
  }
}
