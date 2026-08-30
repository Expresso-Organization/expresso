import { mongoCollections } from "@expresso/database";
import type { MongoTransaction } from "../../platform/mongo-transaction.js";
import { IdentityError } from "./public.js";

export async function requireActiveUser(tx: MongoTransaction, userId: string): Promise<void> {
  const result = await mongoCollections(tx.db).users.updateOne(
    { _id: userId, deletionRequestedAt: null }, { $inc: { lifecycleVersion: 1 } }, { session: tx.session },
  );
  if (result.matchedCount !== 1) throw new IdentityError(401, "account is pending deletion");
}
