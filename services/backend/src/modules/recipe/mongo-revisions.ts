import { randomUUID } from "node:crypto";
import type { JsonObject, JsonValue } from "@expresso/database";
import { mongoCollections } from "@expresso/database";
import type { MongoTransaction } from "../../platform/mongo-transaction.js";
import { deleteSnapshotPayload, snapshotRefFromStored, writeSnapshot } from "../../platform/snapshot-payload.js";

export async function addMongoRecipeRevision(
  tx: MongoTransaction,
  input: { userId: string; recipeId: string; action: string; snapshot: JsonObject; diff: JsonValue[] },
) {
  const revisions = mongoCollections(tx.db).recipeRevisions;
  const id = randomUUID();
  const snapshot = await writeSnapshot(tx, input.userId, input.snapshot);
  await revisions.insertOne({ _id: id, userId: input.userId, recipeId: input.recipeId, actor: "user", action: input.action, snapshot: snapshot as unknown as JsonObject, diff: input.diff, createdAt: new Date() }, { session: tx.session });
  const stale = await revisions.find({ userId: input.userId, recipeId: input.recipeId }, { session: tx.session }).sort({ createdAt: -1, _id: -1 }).skip(50).toArray();
  for (const row of stale) await deleteSnapshotPayload(tx, input.userId, snapshotRefFromStored(row.snapshot));
  if (stale.length) await revisions.deleteMany({ _id: { $in: stale.map(({ _id }) => _id) } }, { session: tx.session });
  return id;
}
