import { mongoCollections } from "@expresso/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createMongoFixture } from "../../../test/support/mongodb.js";
import { MongoSchedulingService } from "./service.js";
import { SCHEDULED_JOB_KEYS, type ScheduledJobKey } from "./public.js";

/**
 * 2026-11-19 PR #240 배포의 재현입니다. 마이그레이션 0032가 이 두 키를 넣은 뒤에도 워커가 재시작될 때까지
 * 옛 코드의 워커가 돌았습니다. 옛 워커는 두 키를 집어 실패시키고 `nextRunAt`을 하루 뒤로 옮겼습니다.
 */
const NEW_KEYS = ["activity_collect", "proposal_briefing"] as const satisfies readonly ScheduledJobKey[];
const DUE = new Date("2026-11-19T00:00:00Z");

describe.skipIf(!process.env.TEST_MONGODB_URL)("MongoDB scheduled jobs the worker does not know", () => {
  let fixture: Awaited<ReturnType<typeof createMongoFixture>>;
  beforeAll(async () => {
    fixture = await createMongoFixture("schedunknown");
    await mongoCollections(fixture.resource.db).scheduledJobDefinitions.updateMany({}, { $set: { nextRunAt: DUE } });
  });
  afterAll(async () => fixture?.dispose());

  it("leaves unknown keys due until a worker that knows them schedules the original slot", async () => {
    const db = mongoCollections(fixture.resource.db); const added = new Set<string>(NEW_KEYS);
    const newDefinitions = () => db.scheduledJobDefinitions.find({ _id: { $in: [...NEW_KEYS] } }).sort({ _id: 1 }).toArray();
    const newRuns = () => db.scheduledJobRuns.find({ jobKey: { $in: [...NEW_KEYS] } }).sort({ jobKey: 1 }).toArray();
    const intervals = (await newDefinitions()).map(({ intervalSeconds }) => intervalSeconds);

    // 옛 워커: 두 키를 모르는 서비스입니다. 폴링이 여러 번 돌아도 두 정의를 건드리지 않습니다.
    const oldWorker = new MongoSchedulingService(fixture.resource, { keys: SCHEDULED_JOB_KEYS.filter((key) => !added.has(key)) });
    const first = await oldWorker.scheduleDue(new Date("2026-11-19T00:10:00Z"));
    expect(first.scheduled).toHaveLength(SCHEDULED_JOB_KEYS.length - NEW_KEYS.length);
    expect((await oldWorker.scheduleDue(new Date("2026-11-19T00:10:01Z"))).scheduled).toEqual([]);
    expect(await newRuns()).toEqual([]);
    expect(await db.outboxEvents.countDocuments({ topic: "scheduled.execute", "payload.jobKey": { $in: [...NEW_KEYS] } })).toBe(0);
    expect((await newDefinitions()).map(({ nextRunAt }) => nextRunAt)).toEqual([DUE, DUE]);

    // 새 워커: 재시작 뒤 첫 폴링에서 원래 예정 시각의 실행을 만듭니다. 하루 뒤로 밀리지 않습니다.
    const newWorker = new MongoSchedulingService(fixture.resource);
    const second = await newWorker.scheduleDue(new Date("2026-11-19T00:10:02Z"));
    expect(second.scheduled).toEqual(expect.arrayContaining((await newRuns()).map(({ _id }) => _id)));
    expect((await newRuns()).map(({ jobKey, scheduledFor, status }) => ({ jobKey, scheduledFor, status }))).toEqual(NEW_KEYS.map((jobKey) => ({ jobKey, scheduledFor: DUE, status: "queued" })));
    expect((await newDefinitions()).map(({ nextRunAt }) => nextRunAt)).toEqual(intervals.map((seconds) => new Date(DUE.getTime() + seconds * 1000)));
  });
});
