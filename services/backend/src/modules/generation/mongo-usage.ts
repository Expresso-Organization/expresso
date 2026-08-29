import { randomUUID } from "node:crypto";

import { mongoCollections, type UsageCounterDoc } from "@expresso/database";
import type { Filter } from "mongodb";

import type { MongoTransaction } from "../../platform/mongo-transaction.js";
import { MongoEntitlementService } from "../entitlements/mongo-service.js";
import { GenerationError } from "./public.js";

/** 성공한 생성 작업 하나를 정확히 한 번만 차감합니다. */
export async function chargeMongoGenerationUsage(
  tx: MongoTransaction,
  userId: string,
  generationJobId: string,
): Promise<void> {
  const db = mongoCollections(tx.db);
  const options = { session: tx.session };
  if (await db.generationUsageLedger.findOne({ userId, generationJobId, reason: "success" }, options)) return;

  const decision = await new MongoEntitlementService(tx).check(userId, "portfolio.generate");
  if (!decision.allowed || !decision.usage) throw new GenerationError(409, "generation quota is exhausted");

  const current = await db.usageCounters.findOne(
    { userId, periodStart: decision.usage.periodStart },
    options,
  );
  let counterId: string;
  if (!current) {
    counterId = randomUUID();
    await db.usageCounters.insertOne({
      _id: counterId,
      userId,
      periodStart: decision.usage.periodStart,
      used: 1,
      resetsAt: new Date(decision.usage.resetsAt),
    }, options);
  } else {
    counterId = current._id;
    const used = decision.usage.limit === null
      ? decision.usage.used
      : { $eq: decision.usage.used, $lt: decision.usage.limit };
    const filter: Filter<UsageCounterDoc> = { _id: current._id, userId, used };
    const changed = await db.usageCounters.updateOne(
      filter,
      { $inc: { used: 1 }, $set: { resetsAt: new Date(decision.usage.resetsAt) } },
      options,
    );
    if (changed.matchedCount !== 1) throw new GenerationError(409, "generation quota is exhausted");
  }

  await db.generationUsageLedger.insertOne({
    _id: randomUUID(), userId, generationJobId, usageCounterId: counterId,
    amount: 1, reason: "success", createdAt: new Date(),
  }, options);
}
