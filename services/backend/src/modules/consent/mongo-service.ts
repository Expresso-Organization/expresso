import { randomUUID } from "node:crypto";
import { CONSENT_POLICY_VERSION, ConsentListResponseSchema, ConsentScopeSchema, type ConsentScope } from "@expresso/contracts";
import { mongoCollections, type ConsentDoc } from "@expresso/database";
import type { MongoContext } from "../../platform/mongodb.js";
import { inTransaction, type MongoTransaction } from "../../platform/mongo-transaction.js";
import type { AiContract } from "../../platform/ai/client.js";
import { requireActiveUser } from "../identity/index.js";
import type { ConsentApi } from "./index.js";
import { CONTRACT_CONSENT, ConsentError, ConsentPolicyMismatch } from "./public.js";

export class MongoConsentService implements ConsentApi {
  readonly #policyVersion: number;
  constructor(readonly context: MongoContext, options: { policyVersion?: number } = {}) { this.#policyVersion = options.policyVersion ?? CONSENT_POLICY_VERSION; }

  #transaction<T>(action: (tx: MongoTransaction) => Promise<T>): Promise<T> {
    // 작업 시작 트랜잭션에 주입된 서비스는 동일 세션의 쓰기 guard를 사용합니다.
    if ("session" in this.context) {
      const tx = this.context as MongoTransaction;
      if (!tx.session.inTransaction()) throw new Error("Consent transaction session is not active");
      return action(tx);
    }
    return inTransaction(this.context, action);
  }

  async list(userId: string) {
    const options = "session" in this.context ? { session: (this.context as MongoTransaction).session } : {};
    const rows = await mongoCollections(this.context.db).consents.find({ userId }, options).sort({ grantedAt: -1, _id: -1 }).toArray();
    const byScope = new Map<ConsentScope, ConsentDoc>();
    for (const row of rows) if (!byScope.has(row.scope)) byScope.set(row.scope, row);
    return ConsentListResponseSchema.parse({ data: { policyVersion: this.#policyVersion, consents: ConsentScopeSchema.options.map(scope => {
      const row = byScope.get(scope);
      const live = row !== undefined && !row.revokedAt;
      return { scope, granted: live && row.policyVersion >= this.#policyVersion, policyVersion: row?.policyVersion ?? null, grantedAt: row?.grantedAt.toISOString() ?? null, revokedAt: row?.revokedAt?.toISOString() ?? null, needsRenewal: live && row.policyVersion < this.#policyVersion };
    }) } });
  }

  async grant(userId: string, scopes: ConsentScope[], policyVersion: number) {
    if (policyVersion !== this.#policyVersion) throw new ConsentPolicyMismatch(policyVersion, this.#policyVersion);
    await this.#transaction(async tx => {
      await requireActiveUser(tx, userId);
      const collection = mongoCollections(tx.db).consents;
      for (const scope of new Set(scopes)) {
        const latest = await collection.findOne({ userId, scope }, { session: tx.session, sort: { grantedAt: -1 } });
        const grantedAt = new Date(Math.max(Date.now(), (latest?.grantedAt.getTime() ?? 0) + 1));
        await collection.updateMany({ userId, scope, revokedAt: null, policyVersion: { $ne: policyVersion } }, { $set: { revokedAt: new Date() } }, { session: tx.session });
        await collection.updateOne({ userId, scope, revokedAt: null }, { $setOnInsert: { _id: randomUUID(), userId, scope, policyVersion, grantedAt, revokedAt: null } }, { upsert: true, session: tx.session });
      }
    });
    return this.list(userId);
  }

  async revoke(userId: string, scope: ConsentScope) {
    await this.#transaction(async tx => {
      await requireActiveUser(tx, userId);
      await mongoCollections(tx.db).consents.updateMany({ userId, scope, revokedAt: null }, { $set: { revokedAt: new Date() } }, { session: tx.session });
    });
    return this.list(userId);
  }

  async require(userId: string, contract: AiContract): Promise<void> {
    const scope = CONTRACT_CONSENT[contract];
    if (scope === null) return;
    await this.#transaction(async tx => {
      await requireActiveUser(tx, userId);
      const result = await mongoCollections(tx.db).consents.updateOne(
        { userId, scope, revokedAt: null, policyVersion: { $gte: this.#policyVersion } },
        { $inc: { useVersion: 1 } }, { session: tx.session },
      );
      if (!result.matchedCount) throw new ConsentError(scope);
    });
  }
}
