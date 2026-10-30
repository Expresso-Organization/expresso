import {
  encodeDocumentAsYUpdate,
  encodeDocumentUpdatesStateVector,
  mergeDocumentYUpdates,
  reconstructYDocument,
} from "@expresso/editor";
import type { JsonValue } from "@expresso/database";
import { BLOCKNOTE_SCHEMA_VERSION } from "@expresso/editor/blocknote";
import { Binary, type ClientSession } from "mongodb";

import { blockNoteStateVector, restoreBlockNote } from "./blocknote-document.js";
import { CareerDocumentError } from "./errors.js";
import { readCareerSnapshotUpdate } from "../../platform/career-document-snapshot.js";
import { binaryBytes, hashUpdate, type CareerDocumentRepository } from "./repository.js";

export async function compactDocument(
  repository: CareerDocumentRepository,
  recordId: string,
  expectedSequence: number,
  session?: ClientSession,
) {
  const snapshot = await repository.snapshot(recordId, session);
  if (snapshot && snapshot.serverSequence >= expectedSequence) {
    // AI 적용 전 · 편집 이력처럼 다른 경로가 먼저 스냅샷을 남겼어도, 그 스냅샷이 덮은 업데이트는 압축된 것입니다.
    await repository.markCompacted(recordId, snapshot.serverSequence, session);
    return { recordId, serverSequence: snapshot.serverSequence, snapshotId: snapshot._id };
  }
  const record = await repository.recordById(recordId, session);
  if (!record) throw new CareerDocumentError(404, "career record not found");
  if ((record.documentVersion ?? 0) !== expectedSequence) {
    throw new CareerDocumentError(409, "document sequence is stale");
  }
  const updates = await repository.updates(recordId, snapshot?.serverSequence ?? 0, session);
  const through = updates.at(-1)?.serverSequence ?? snapshot?.serverSequence ?? 0;
  if (through !== expectedSequence) throw new CareerDocumentError(409, "document sequence is stale");

  if (snapshot?.schemaVersion === BLOCKNOTE_SCHEMA_VERSION && snapshot.state) {
    // BlockNote 문서는 저장된 Yjs 상태에 업데이트를 합쳐 다음 스냅샷을 만듭니다.
    const restored = restoreBlockNote(binaryBytes(snapshot.state), updates.map((row) => binaryBytes(row.update)));
    const snapshotId = crypto.randomUUID();
    await repository.insertSnapshot({
      _id: snapshotId, recordId, userId: record.userId, documentVersion: expectedSequence, version: expectedSequence,
      schemaVersion: BLOCKNOTE_SCHEMA_VERSION, content: restored.blocks as unknown as JsonValue,
      stateVector: new Binary(Buffer.from(blockNoteStateVector(restored.state))), state: new Binary(Buffer.from(restored.state)),
      serverSequence: through, checksum: hashUpdate(restored.state), actor: "migration", createdAt: new Date(),
    }, session);
    if (!await repository.setLatestSnapshot(recordId, record.userId, expectedSequence, snapshotId, session)) {
      throw new CareerDocumentError(409, "document sequence is stale");
    }
    await repository.markCompacted(recordId, through, session);
    return { recordId, serverSequence: through, snapshotId };
  }
  const base = snapshot
    ? readCareerSnapshotUpdate(snapshot)
    : undefined;
  const stateUpdate = mergeDocumentYUpdates([
    ...(base ? [base] : []),
    ...updates.map((row) => binaryBytes(row.update)),
  ]);
  const document = reconstructYDocument([stateUpdate]);
  const canonicalUpdate = encodeDocumentAsYUpdate(document);
  const snapshotId = crypto.randomUUID();
  await repository.insertSnapshot({
    _id: snapshotId,
    recordId,
    userId: record.userId,
    documentVersion: expectedSequence,
    version: expectedSequence,
    schemaVersion: 1,
    content: document as unknown as JsonValue,
    stateVector: new Binary(Buffer.from(encodeDocumentUpdatesStateVector([stateUpdate]))),
    stateUpdate: new Binary(Buffer.from(stateUpdate)),
    serverSequence: through,
    checksum: hashUpdate(canonicalUpdate),
    actor: "migration",
    createdAt: new Date(),
  }, session);
  if (!await repository.setLatestSnapshot(recordId, record.userId, expectedSequence, snapshotId, session)) {
    throw new CareerDocumentError(409, "document sequence is stale");
  }
  await repository.markCompacted(recordId, through, session);
  return { recordId, serverSequence: through, snapshotId };
}
