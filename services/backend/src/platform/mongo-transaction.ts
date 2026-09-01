import type { ClientSession } from "mongodb";
import type { MongoContext } from "./mongodb.js";

export interface MongoTransaction extends MongoContext { session: ClientSession }

/** 콜백은 재실행될 수 있습니다. 외부 AI·큐 호출은 커밋 뒤에 수행합니다. */
export function inTransaction<T>(context: MongoContext, action: (tx: MongoTransaction) => Promise<T>): Promise<T> {
  return context.client.withSession((session) => session.withTransaction(
    () => action({ ...context, session }),
    { readConcern: { level: "snapshot" }, writeConcern: { w: "majority", j: true }, readPreference: "primary" },
  ));
}
