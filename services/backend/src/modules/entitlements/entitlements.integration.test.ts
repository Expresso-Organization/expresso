import {
  EntitlementDecisionResponseSchema,
  type PlanCode,
} from "@expresso/contracts";
import { randomUUID } from "node:crypto";
import { createMysqlResource } from "../../platform/legacy-mysql.js";
import type { SqlTag } from "../../platform/legacy-mysql.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApi } from "../../api/build-app.js";
import type { RuntimeConfig } from "../../config/runtime-config.js";
import { IdentityService } from "../identity/legacy-mysql-service.js";
import { EntitlementService } from "./legacy-mysql-service.js";
import { MongoEntitlementService, type EntitlementApi } from "./index.js";
import { MongoIdentityService, type IdentityApi } from "../identity/index.js";
import { mongoCollections } from "@expresso/database";
import { createMongoFixture } from "../../../test/support/mongodb.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

const config: RuntimeConfig = {
  nodeEnv: "test",
  host: "127.0.0.1",
  port: 4_000,
  logLevel: "silent",
  databaseUrl: databaseUrl ?? "mysql://127.0.0.1:1/unused",
  redisUrl: "redis://127.0.0.1:1",
  outboxPollIntervalMs: 1_000,
  outboxBatchSize: 25,
  outboxMaxAttempts: 5,
  queuePrefix: "expresso-entitlement-test",
};

interface PlanRow {
  id: string;
  code: PlanCode;
  generation_quota: number;
}

interface IdRow {
  id: string;
}

for (const engine of ["mysql", "mongodb"] as const) {
describe.skipIf(engine === "mysql" ? !databaseUrl : !(process.env.TEST_MONGODB_URL ?? process.env.TEST_MONGODB_ADMIN_URL))(`entitlement integration (${engine})`, () => {
  let sql: SqlTag;
  let fixture: Awaited<ReturnType<typeof createMongoFixture>> | undefined;
  let identityService: IdentityApi;
  let entitlementService: EntitlementApi;
  let app: ReturnType<typeof buildApi>;
  const userIds: Partial<Record<PlanCode, string>> = {};
  let planIds: Record<PlanCode, string>;
  let freeQuota: number;
  let preservedRecordId: string;

  beforeAll(async () => {
    if (engine === "mongodb") {
      fixture = await createMongoFixture("entitlements");
      identityService = new MongoIdentityService(fixture.resource);
      entitlementService = new MongoEntitlementService(fixture.resource);
      app = buildApi({ config, identityService, entitlementService });
      const collections = mongoCollections(fixture.resource.db);
      const plans = await collections.plans.find().toArray();
      planIds = Object.fromEntries(plans.map(plan => [plan.code, plan._id])) as Record<PlanCode, string>;
      freeQuota = plans.find(plan => plan.code === "free")!.generationQuota;
      for (const planCode of ["free", "pro", "team"] as const) {
        const userId = randomUUID(); userIds[planCode] = userId;
        await collections.users.insertOne({ _id: userId, email: `${userId}@example.com`, displayName: planCode, planId: planIds[planCode], createdAt: new Date() });
      }
      preservedRecordId = randomUUID();
      await collections.careerRecords.insertOne({ _id: preservedRecordId, userId: userIds.team!, categoryId: "475106fc-bf88-4a73-9c27-66c648733936", title: "Preserved after downgrade", origin: "manual", status: "draft", properties: {}, bodyMd: "", version: 1, updatedAt: new Date() });
      await app.ready(); return;
    }
    sql = createMysqlResource(databaseUrl!).sql;
    identityService = new IdentityService(sql);
    entitlementService = new EntitlementService(sql);
    app = buildApi({ config, identityService, entitlementService });
    const plans = await sql<PlanRow[]>`
      select id, code, generation_quota
      from plan
      where code in ('free', 'pro', 'team')
    `;
    const byCode = new Map(plans.map((plan) => [plan.code, plan]));
    const free = byCode.get("free");
    const pro = byCode.get("pro");
    const team = byCode.get("team");
    if (!free || !pro || !team) throw new Error("canonical plans are missing");
    planIds = { free: free.id, pro: pro.id, team: team.id };
    freeQuota = free.generation_quota;

    for (const planCode of ["free", "pro", "team"] as const) {
      const rows: IdRow[] = [{ id: randomUUID() }];
    await sql`
      insert into \`user\` (id, email, display_name, plan_id)
      values
        (${rows[0]!.id}, ${`entitlement-${planCode}-${randomUUID()}@example.com`},
          ${`Entitlement ${planCode}`},
          ${planIds[planCode]})
    `;
      const userId = rows[0]?.id;
      if (!userId) throw new Error(`failed to create ${planCode} user`);
      userIds[planCode] = userId;
    }

    const teamUserId = userIds.team;
    if (!teamUserId) throw new Error("team user is missing");
    const categories = await sql<IdRow[]>`
      insert into category (
        user_id, \`key\`, name, icon, default_view, is_system
      )
      values (
        ${teamUserId}, ${`preserved-${randomUUID()}`},
        'Preserved', 'folder', 'table', false
      )
      returning id
    `;
    const categoryId = categories[0]?.id;
    if (!categoryId) throw new Error("test category was not persisted");
    const records = await sql<IdRow[]>`
      insert into record (user_id, category_id, title, origin)
      values (${teamUserId}, ${categoryId}, 'Preserved after downgrade', 'manual')
      returning id
    `;
    const recordId = records[0]?.id;
    if (!recordId) throw new Error("test record was not persisted");
    preservedRecordId = recordId;
    await app.ready();
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    if (fixture) { await fixture.dispose(); return; }
    const ids = Object.values(userIds);
    if (ids.length > 0) await sql`delete from \`user\` where id in ${sql(ids)}`;
    await sql.end({ timeout: 5 });
  });

  it("returns the same central decision contract through a protected route", async () => {
    const freeUserId = userIds.free;
    if (!freeUserId) throw new Error("free user is missing");
    const session = await identityService.issueSession({ userId: freeUserId });

    const response = await app.inject({
      method: "GET",
      url: "/v1/entitlements/export.document",
      headers: { authorization: `Bearer ${session.accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    expect(EntitlementDecisionResponseSchema.parse(response.json()).data).toEqual({
      capability: "export.document",
      planCode: "free",
      allowed: false,
      reason: "PLAN_REQUIRED",
    });
  });

  it("resets exhausted generation quota at the KST month boundary", async () => {
    const freeUserId = userIds.free;
    if (!freeUserId) throw new Error("free user is missing");
    if (fixture) await mongoCollections(fixture.resource.db).usageCounters.insertOne({ _id: randomUUID(), userId: freeUserId, periodStart: "2026-08-01", used: freeQuota, resetsAt: new Date("2026-08-31T15:00:00Z") });
    else await sql`
      insert into usage_counter (user_id, period_start, used, resets_at)
      values (${freeUserId}, '2026-08-01', ${freeQuota}, '2026-08-31 15:00:00')
      as new on duplicate key update used = new.used, resets_at = new.resets_at
    `;

    const beforeReset = await entitlementService.check(
      freeUserId,
      "portfolio.generate",
      new Date("2026-08-31T14:59:59.999Z"),
    );
    expect(beforeReset).toMatchObject({
      allowed: false,
      reason: "QUOTA_EXHAUSTED",
      usage: { used: freeQuota, remaining: 0, periodStart: "2026-08-01" },
    });

    const afterReset = await entitlementService.check(
      freeUserId,
      "portfolio.generate",
      new Date("2026-08-31T15:00:00.000Z"),
    );
    expect(afterReset).toMatchObject({
      allowed: true,
      reason: "ENTITLED",
      usage: { used: 0, remaining: freeQuota, periodStart: "2026-09-01" },
    });
  });

  it("changes access on downgrade without deleting existing user data", async () => {
    const teamUserId = userIds.team;
    if (!teamUserId) throw new Error("team user is missing");
    await expect(
      entitlementService.check(teamUserId, "analysis.advanced"),
    ).resolves.toMatchObject({ allowed: true, planCode: "team" });

    if (fixture) await mongoCollections(fixture.resource.db).users.updateOne({ _id: teamUserId }, { $set: { planId: planIds.free } });
    else await sql`
      update \`user\` set plan_id = ${planIds.free} where id = ${teamUserId}
    `;

    await expect(
      entitlementService.check(teamUserId, "analysis.advanced"),
    ).resolves.toMatchObject({
      allowed: false,
      planCode: "free",
      reason: "PLAN_REQUIRED",
    });
    const records = fixture ? (await mongoCollections(fixture.resource.db).careerRecords.find({ _id: preservedRecordId, userId: teamUserId }).toArray()).map(row => ({ id: row._id })) : await sql<IdRow[]>`
      select id from record
      where id = ${preservedRecordId} and user_id = ${teamUserId}
    `;
    expect(records).toEqual([{ id: preservedRecordId }]);
  });
});
}
