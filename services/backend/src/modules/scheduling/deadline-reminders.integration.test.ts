import { randomUUID } from "node:crypto";

import { mongoCollections } from "@expresso/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createMongoFixture } from "../../../test/support/mongodb.js";
import { MongoIdentityService } from "../identity/index.js";
import { MongoSchedulingService } from "./service.js";

describe.skipIf(!process.env.TEST_MONGODB_URL)("MongoDB deadline reminders", () => {
  let fixture: Awaited<ReturnType<typeof createMongoFixture>>;
  let service: MongoSchedulingService;
  let userId = "";
  const at = new Date("2026-09-01T00:00:00Z");
  const hours = (value: number) => new Date(at.getTime() + value * 3_600_000);

  beforeAll(async () => {
    fixture = await createMongoFixture("deadline");
    service = new MongoSchedulingService(fixture.resource);
    userId = (await new MongoIdentityService(fixture.resource).signup({ email: `deadline-${randomUUID()}@example.com`, displayName: "Deadline", password: "correct-horse-battery-staple" })).user.id;
  });
  afterAll(async () => fixture?.dispose());

  /** 마감 알림 잡 하나만 실행한다. 다른 잡은 다음 실행 시각을 뒤로 민다. */
  async function runDeadlineReminders(now: Date) {
    const db = mongoCollections(fixture.resource.db);
    await db.scheduledJobDefinitions.updateMany({}, { $set: { nextRunAt: new Date("2099-01-01T00:00:00Z") } });
    await db.scheduledJobDefinitions.updateOne({ _id: "deadline_reminders" }, { $set: { nextRunAt: now } });
    const { scheduled } = await service.scheduleDue(now);
    expect(scheduled).toHaveLength(1);
    return service.process(scheduled[0]!, now);
  }

  it("notifies once per saved posting whose deadline is within three days", async () => {
    const db = mongoCollections(fixture.resource.db);
    const companyId = randomUUID();
    await db.companies.insertOne({ _id: companyId, name: "Expresso", brandColors: [] });
    const posting = (title: string, expiresAt: Date | null) => ({ _id: randomUUID(), companyId, source: "api" as const, title, descriptionRaw: "", requirements: {}, dedupeHash: randomUUID(), createdAt: at, duties: [], preferred: [], hiringProcess: [], expiresAt });
    const soon = posting("Backend Engineer", hours(48));
    const later = posting("Data Engineer", hours(100));
    const ownDeadline = posting("Frontend Engineer", hours(500));
    const applied = posting("Platform Engineer", hours(24));
    await db.jobPostings.insertMany([soon, later, ownDeadline, applied]);
    await db.interests.insertMany([
      { _id: randomUUID(), userId, jobPostingId: soon._id, stage: "saved", updatedAt: at },
      { _id: randomUUID(), userId, jobPostingId: later._id, stage: "saved", updatedAt: at },
      // 사용자가 적은 마감이 공고 마감보다 앞선다.
      { _id: randomUUID(), userId, jobPostingId: ownDeadline._id, stage: "saved", deadlineAt: hours(12), updatedAt: at },
      { _id: randomUUID(), userId, jobPostingId: applied._id, stage: "applied", updatedAt: at },
    ]);

    await expect(runDeadlineReminders(at)).resolves.toMatchObject({ status: "succeeded", result: { candidates: 2, created: 2, skipped: 0, failed: 0 } });
    const rows = await db.notifications.find({ userId, kind: "deadline" }).sort({ subject: 1 }).toArray();
    expect(rows.map(({ subject, targetUrl }) => ({ subject, targetUrl }))).toEqual([
      { subject: "Expresso · Backend Engineer", targetUrl: `/jobs/${soon._id}` },
      { subject: "Expresso · Frontend Engineer", targetUrl: `/jobs/${ownDeadline._id}` },
    ]);

    // 다음 날 다시 돌아도 같은 공고로 또 만들지 않는다.
    await expect(runDeadlineReminders(hours(24))).resolves.toMatchObject({ result: { created: 0, skipped: 1 } });
    expect(await db.notifications.countDocuments({ userId, kind: "deadline" })).toBe(2);
  });
});
