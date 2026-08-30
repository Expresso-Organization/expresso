import { mongoCollections } from "@expresso/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createMongoFixture } from "../../../test/support/mongodb.js";
import { MongoSchedulingService } from "./service.js";
import { SCHEDULED_JOB_KEYS, type ScheduledJobKey } from "./public.js";

describe.skipIf(!process.env.TEST_MONGODB_URL)("MongoDB scheduled jobs", () => {
  let fixture: Awaited<ReturnType<typeof createMongoFixture>>; let service: MongoSchedulingService; let retentionCalls = 0;
  beforeAll(async () => {
    fixture = await createMongoFixture("scheduling"); service = new MongoSchedulingService(fixture.resource, { overrides: { retention: async () => { retentionCalls += 1; if (retentionCalls === 1) throw new Error("retention fixture failure"); return { retained: true }; } } });
    await mongoCollections(fixture.resource.db).scheduledJobDefinitions.updateMany({}, { $set: { nextRunAt: new Date("2026-08-09T00:00:00Z") } });
  });
  afterAll(async () => fixture?.dispose());

  it("keeps seed definitions aligned with code and schedules each due slot once", async () => {
    const db = mongoCollections(fixture.resource.db); const rows = await db.scheduledJobDefinitions.find().sort({ _id: 1 }).toArray(); const known = new Set<string>(SCHEDULED_JOB_KEYS);
    expect(rows.filter(({ _id }) => !known.has(_id))).toEqual([]);
    const now = new Date("2026-08-09T01:00:00Z"); const ticks = await Promise.all(Array.from({ length: 20 }, () => service.scheduleDue(now)));
    expect(new Set(ticks.flatMap(({ scheduled }) => scheduled)).size).toBe(rows.length); expect(await db.scheduledJobRuns.countDocuments()).toBe(rows.length); expect(await db.outboxEvents.countDocuments({ topic: "scheduled.execute" })).toBe(rows.length);
  });

  it("claims once, exposes failures, and retries a failed run", async () => {
    const db = mongoCollections(fixture.resource.db); const runs = await db.scheduledJobRuns.find().sort({ jobKey: 1 }).toArray(); const retention = runs.find(({ jobKey }) => jobKey === "retention"); if (!retention) throw new Error("retention run missing");
    for (const run of runs.filter(({ _id }) => _id !== retention._id)) { await Promise.all(Array.from({ length: 5 }, () => service.process(run._id, new Date("2026-08-09T01:00:01Z")))); expect((await service.getRun(run._id)).attempts).toBe(1); }
    await expect(service.process(retention._id, new Date("2026-08-09T01:00:01Z"))).rejects.toThrow(/fixture/); await expect(service.getRun(retention._id, new Date("2026-08-09T01:00:02Z"))).resolves.toMatchObject({ status: "failed", attempts: 1, lastError: "Error" });
    await expect(service.process(retention._id, new Date("2026-08-09T01:00:03Z"))).resolves.toMatchObject({ status: "succeeded", attempts: 2, result: { retained: true } }); await service.process(retention._id, new Date("2026-08-09T01:00:04Z")); expect(retentionCalls).toBe(2);
    const statuses = await service.status(); expect(statuses).toHaveLength(SCHEDULED_JOB_KEYS.length); expect(statuses.find(({ jobKey }) => jobKey === "retention")).toMatchObject({ lastStatus: "succeeded", failureCount: 0 });
  }, 30_000);
});
