import { randomUUID } from "node:crypto";

import { mongoCollections } from "@expresso/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createMongoFixture } from "../../../test/support/mongodb.js";
import { MongoIdentityService } from "../identity/index.js";
import { MongoEngagementService } from "./service.js";

describe.skipIf(!process.env.TEST_MONGODB_URL)("MongoDB engagement", () => {
  let fixture: Awaited<ReturnType<typeof createMongoFixture>>;
  let service: MongoEngagementService;
  let userId = "";
  beforeAll(async () => { fixture = await createMongoFixture("engagement"); service = new MongoEngagementService(fixture.resource); userId = (await new MongoIdentityService(fixture.resource).signup({ email: `engagement-${randomUUID()}@example.com`, displayName: "Engagement", password: "correct-horse-battery" })).user.id; });
  afterAll(async () => fixture?.dispose());

  it("embeds preferences and deduplicates notifications by KST date", async () => {
    await service.setPreference(userId, "deadline", false);
    expect(await service.preferences(userId)).toContainEqual({ kind: "deadline", enabled: false });
    await expect(service.notify(userId, "deadline", "/jobs/1", "deadline:1")).resolves.toMatchObject({ created: false, reason: "PREFERENCE_DISABLED" });
    const first = await service.notify(userId, "generation", "/portfolios/1", "generation:1", new Date("2026-08-09T01:00:00Z"));
    await expect(service.notify(userId, "generation", "/portfolios/1", "generation:1", new Date("2026-08-09T10:00:00Z"))).resolves.toMatchObject({ created: false, reason: "DUPLICATE" });
    expect(first.notification?.id).toBeTruthy();
    expect(await mongoCollections(fixture.resource.db).outboxEvents.countDocuments({ topic: "notification.deliver" })).toBe(1);
  });

  it("keeps delivery retry state and returns empty home/search models", async () => {
    const created = await service.notify(userId, "traffic", "/analytics", "traffic:retry", new Date("2026-08-09T02:00:00Z"));
    const id = created.notification!.id;
    await expect(service.deliver(id, { async send() { throw new Error("temporary"); } }, new Date("2026-08-09T02:00:00Z"))).rejects.toThrow("temporary");
    await expect(service.getNotificationById(id)).resolves.toMatchObject({ deliveryStatus: "failed", attempts: 1 });
    await expect(service.deliver(id, { async send() {} }, new Date("2026-08-09T02:00:03Z"))).resolves.toMatchObject({ deliveryStatus: "sent", attempts: 2 });
    await expect(service.home(userId)).resolves.toMatchObject({ empty: { brews: true, portfolios: true, recommendations: true, metrics: true } });
    await expect(service.search(userId, { q: "nothing", limit: 10 })).resolves.toEqual({ data: [], page: { hasNextPage: false, nextCursor: null } });
  });
});
