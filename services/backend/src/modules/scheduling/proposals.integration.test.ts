import { randomUUID } from "node:crypto";

import { mongoCollections } from "@expresso/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createMongoFixture } from "../../../test/support/mongodb.js";
import type { ScheduledJobKey } from "./public.js";
import { MongoSchedulingService } from "./service.js";

describe.skipIf(!process.env.TEST_MONGODB_URL)("예약 잡과 능동 제안", () => {
  let fixture: Awaited<ReturnType<typeof createMongoFixture>>;
  beforeAll(async () => { fixture = await createMongoFixture("schedproposals"); }, 60000);
  afterAll(async () => fixture?.dispose());

  /** 예약된 실행 하나를 만들어 돌린다. */
  const run = async (service: MongoSchedulingService, jobKey: ScheduledJobKey) => {
    const id = randomUUID(); const at = new Date("2026-11-15T03:00:00Z");
    await mongoCollections(fixture.resource.db).scheduledJobRuns.insertOne({ _id: id, jobKey, scheduledFor: new Date(at.getTime() + Math.floor(Math.random() * 1_000_000)), status: "queued", attempts: 0, createdAt: at } as never);
    return (await service.process(id, at)).result;
  };
  const world = (added: { jobs: number; activities: number }) => {
    const calls: string[] = [];
    const service = new MongoSchedulingService(fixture.resource, {
      ingest: { run: async () => ({ added: added.jobs, sources: 1 }), readPendingFacts: async () => ({}) } as never,
      activities: { collect: async () => ({ read: 5, added: added.activities, updated: 5 - added.activities }) },
      proposals: {
        requestDaily: async () => { calls.push("daily"); return { requested: 3 }; },
        requestForNews: async () => { calls.push("news"); return { requested: 2 }; },
      },
    });
    return { service, calls };
  };

  it("매일 잡은 켠 사용자에게 오늘의 실행을 맡긴다", async () => {
    const { service, calls } = world({ jobs: 0, activities: 0 });
    expect(await run(service, "proposal_briefing")).toEqual({ requested: 3 });
    expect(calls).toEqual(["daily"]);
  });

  it("수집이 새 항목을 들였을 때만 새 소식 실행을 맡긴다", async () => {
    const quiet = world({ jobs: 0, activities: 0 });
    expect(await run(quiet.service, "job_ingest")).toEqual({ added: 0, sources: 1 });
    expect(await run(quiet.service, "activity_collect")).toEqual({ read: 5, added: 0, updated: 5 });
    expect(quiet.calls).toEqual([]);

    const busy = world({ jobs: 4, activities: 1 });
    expect(await run(busy.service, "job_ingest")).toEqual({ added: 4, sources: 1, proposalsRequested: 2 });
    expect(await run(busy.service, "activity_collect")).toEqual({ read: 5, added: 1, updated: 4, proposalsRequested: 2 });
    expect(busy.calls).toEqual(["news", "news"]);
  });

  it("연결되지 않은 자리는 건너뛴 까닭을 남긴다", async () => {
    const service = new MongoSchedulingService(fixture.resource);
    expect(await run(service, "proposal_briefing")).toEqual({ skipped: "proposal service is not wired" });
    expect(await run(service, "activity_collect")).toEqual({ skipped: "activity service is not wired" });
  });

  it("컨설턴트의 확인 작업은 정해진 시각에 그 모듈의 함수를 부르고, 정의가 DB에 함께 있다", async () => {
    const seen: Date[] = [];
    const service = new MongoSchedulingService(fixture.resource, { consultant: { run: async (at) => { seen.push(at); return { users: 2, asked: 1, quiet: 0, notified: 1, failed: 0 }; } } });
    expect(await run(service, "consultant_checkins")).toEqual({ users: 2, asked: 1, quiet: 0, notified: 1, failed: 0 });
    expect(seen).toEqual([new Date("2026-11-15T03:00:00Z")]);
    expect(await run(new MongoSchedulingService(fixture.resource), "consultant_checkins")).toEqual({ skipped: "consultant service is not wired" });
    const definition = await mongoCollections(fixture.resource.db).scheduledJobDefinitions.findOne({ _id: "consultant_checkins" });
    expect(definition).toMatchObject({ intervalSeconds: 86_400 });
  });
});
