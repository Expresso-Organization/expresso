import { randomUUID } from "node:crypto";
import type { JsonObject, JsonValue } from "@expresso/database";
import { mongoCollections } from "@expresso/database";
import type { MongoTransaction } from "../../platform/mongo-transaction.js";

export async function addMongoRecipeRevision(
  tx: MongoTransaction,
  input: { userId: string; recipeId: string; action: string; snapshot: JsonObject; diff: JsonValue[] },
) {
  const revisions = mongoCollections(tx.db).recipeRevisions;
  const id = randomUUID();
  await revisions.insertOne({ _id: id, userId: input.userId, recipeId: input.recipeId, actor: "user", action: input.action, snapshot: input.snapshot, diff: input.diff, createdAt: new Date() }, { session: tx.session });
  const stale = await revisions.find({ userId: input.userId, recipeId: input.recipeId }, { session: tx.session }).sort({ createdAt: -1, _id: -1 }).skip(50).project<{ _id: string }>({ _id: 1 }).toArray();
  if (stale.length) await revisions.deleteMany({ _id: { $in: stale.map(({ _id }) => _id) } }, { session: tx.session });
  return id;
}
