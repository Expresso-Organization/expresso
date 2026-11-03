import { randomUUID } from "node:crypto";

import { mongoCollections } from "@expresso/database";

import type { MongoTransaction } from "../../platform/mongo-transaction.js";
import { kstMonthlyPeriod } from "../entitlements/index.js";

/**
 * 성공한 생성 작업 하나를 정확히 한 번만 센다.
 *
 * 한도 판단에는 쓰지 않는다. 한도는 AI 사용량(크레딧)이고 생성을 시작할 때
 * `submit`이 본다. 끝난 작업을 여기서 다시 막으면 이미 토큰을 쓴 지면을 버리게 된다.
 * 월 생성 횟수는 기록으로만 남는다.
 */
export async function chargeMongoGenerationUsage(
  tx: MongoTransaction,
  userId: string,
  generationJobId: string,
): Promise<void> {
  const db = mongoCollections(tx.db);
  const options = { session: tx.session };
  if (await db.generationUsageLedger.findOne({ userId, generationJobId, reason: "success" }, options)) return;

  const period = kstMonthlyPeriod(new Date());
  const counter = await db.usageCounters.findOneAndUpdate(
    { userId, periodStart: period.periodStart },
    { $inc: { used: 1 }, $set: { resetsAt: new Date(period.resetsAt) }, $setOnInsert: { _id: randomUUID() } },
    { ...options, upsert: true, returnDocument: "after" },
  );
  if (!counter) throw new Error("usage counter was not written");

  await db.generationUsageLedger.insertOne({
    _id: randomUUID(), userId, generationJobId, usageCounterId: counter._id,
    amount: 1, reason: "success", createdAt: new Date(),
  }, options);
}
