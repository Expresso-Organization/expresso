import {
  encodeDocumentAsYUpdate,
  encodeDocumentStateVector,
  parseCareerDocument,
  reconstructYDocument,
} from "@expresso/editor";
import type { JsonValue } from "@expresso/database";
import { Binary, type ClientSession } from "mongodb";

import { CareerDocumentError } from "./errors.js";
import { binaryBytes, hashUpdate, type CareerDocumentRepository } from "./repository.js";

export async function compactDocument(
  repository: CareerDocumentRepository,
  recordId: string,
  expectedSequence: number,
  session?: ClientSession,
) {
  const snapshot = await repository.snapshot(recordId, session);
  if (snapshot && snapshot.serverSequence >= expectedSequence) {
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

  const base = snapshot
    ? encodeDocumentAsYUpdate(parseCareerDocument(snapshot.content))
    : undefined;
  const document = reconstructYDocument([
    ...(base ? [base] : []),
    ...updates.map((row) => binaryBytes(row.update)),
  ]);
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
    stateVector: new Binary(Buffer.from(encodeDocumentStateVector(document))),
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
