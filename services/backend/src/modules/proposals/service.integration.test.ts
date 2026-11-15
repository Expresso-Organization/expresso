import { randomUUID } from "node:crypto";

import { mongoCollections } from "@expresso/database";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createMongoFixture } from "../../../test/support/mongodb.js";
import { ConsentError } from "../consent/index.js";
import type { Candidates } from "./candidates.js";
import { ProposalService } from "./service.js";
import type { ProposalWriter, WrittenProposal } from "./writer.js";

const RECORD_ID = randomUUID();
const JOB_ID = randomUUID();
const CATEGORY_ID = randomUUID();

/** 서비스가 읽는 것들의 가짜. 저장소(`proposal_feeds` · outbox)만 진짜다. */
function world(overrides: { remaining?: number | null; consent?: boolean; jobCreatedAt?: string } = {}) {
  const state = { remaining: overrides.remaining ?? 100 as number | null, consent: overrides.consent ?? true, jobCreatedAt: overrides.jobCreatedAt ?? "2026-11-15T00:00:00.000Z", jobTechnologies: ["React"] };
  const written: Candidates[] = [];
  const writer: ProposalWriter = {
    async write(_userId, candidates) {
      written.push(candidates);
      return candidates.jobs.map((job): WrittenProposal => ({ subject: { kind: "job", id: job.id }, action: "compare_job", title: "요건을 대조해 보세요", reason: "「가계부 PWA」 경험이 이어집니다.", recordIds: [RECORD_ID] }));
    },
  };
  const dependencies = {
    career: {
      listCategories: async () => [{ id: CATEGORY_ID, key: "skill_tool", name: "스킬 · 도구", propertySchemaV2: [] }],
      listRecords: async () => ({ data: [{ id: RECORD_ID, categoryId: CATEGORY_ID, categoryKey: "skill_tool", title: "React · Next.js", bodyMd: "3년 사용", properties: {}, isEmpty: false }] }),
    },
    jobs: {
      list: async (_userId: string, query: { interested?: boolean; page?: number }) => ({
        data: query.interested || (query.page ?? 1) > 1 ? [] : [{ id: JOB_ID, title: "프론트엔드 개발자", company: { name: "모아마켓" }, family: "프론트엔드", technologies: state.jobTechnologies.map((name) => ({ name, matched: null })), daysLeft: 12, createdAt: state.jobCreatedAt }],
      }),
    },
    activities: { list: async () => [] },
    consent: { require: async () => { if (!state.consent) throw new ConsentError("career_records"); } },
    credits: { credits: async () => ({ remaining: state.remaining }) },
  };
  return { state, written, writer, dependencies };
}

describe.skipIf(!(process.env.TEST_MONGODB_ADMIN_URL ?? process.env.TEST_MONGODB_URL))("능동 제안", () => {
  let fixture: Awaited<ReturnType<typeof createMongoFixture>>;
  let userId = "";
  const at = new Date("2026-11-15T03:00:00.000Z");
  beforeAll(async () => { fixture = await createMongoFixture("proposals"); }, 60000);
  afterAll(async () => { await fixture?.dispose(); });
  beforeEach(() => { userId = randomUUID(); });

  const service = (w: ReturnType<typeof world>, writer: ProposalWriter | null = w.writer) => new ProposalService(fixture.resource, { ...w.dependencies, writer } as never);
  const outbox = () => mongoCollections(fixture.resource.db).outboxEvents.find({ userId, topic: "proposals.generate" }).toArray();

  it("동의가 없으면 켜지 못하고, 켜지 않은 사용자에게는 아무것도 맡기지 않는다", async () => {
    const w = world({ consent: false });
    await expect(service(w).enable(userId, at)).rejects.toBeInstanceOf(ConsentError);
    expect(await service(w).feed(userId, at)).toMatchObject({ enabled: false, proposals: [], run: { status: "idle" } });
    expect(await outbox()).toHaveLength(0);
    await expect(service(w).refresh(userId, at)).rejects.toMatchObject({ statusCode: 409 });
  });

  it("켜면 첫 실행을 줄에 넣고, 워커가 돌리면 후보 안에서 쓴 제안이 저장된다", async () => {
    const w = world();
    const proposals = service(w);
    expect(await proposals.enable(userId, at)).toMatchObject({ enabled: true, run: { status: "queued", trigger: "enable" } });
    expect((await outbox()).map(({ payload }) => payload)).toEqual([{ userId, trigger: "enable", requestedAt: at.toISOString() }]);
    // 줄에 있는 동안에는 다시 받을 수 없다.
    await expect(proposals.refresh(userId, at)).rejects.toMatchObject({ statusCode: 409 });

    expect(await proposals.run(userId, "enable", at)).toMatchObject({ status: "complete", reason: null, written: 1 });
    const feed = await proposals.feed(userId, at);
    expect(feed.run).toMatchObject({ status: "complete", read: { records: 1, jobs: 1, activities: 0 } });
    expect(feed.proposals).toHaveLength(1);
    expect(feed.proposals[0]).toMatchObject({
      action: "compare_job",
      subject: { kind: "job", id: JOB_ID, label: "모아마켓 · 프론트엔드 개발자", href: `/jobs/${JOB_ID}`, daysLeft: 12 },
      records: [{ kind: "record", id: RECORD_ID, label: "React · Next.js" }],
      start: { kind: "chat", label: "요건 대조하기", contexts: [{ kind: "job", id: JOB_ID }, { kind: "record", id: RECORD_ID }] },
    });
    expect(w.written[0]?.jobs.map(({ id, matched }) => [id, matched])).toEqual([[JOB_ID, ["React"]]]);
  });

  it("남은 날은 읽을 때 다시 세고, 마감이 지난 제안은 보이지 않는다", async () => {
    const w = world();
    const proposals = service(w);
    await proposals.enable(userId, at);
    await proposals.run(userId, "enable", at);
    expect((await proposals.feed(userId, at)).proposals[0]?.subject.daysLeft).toBe(12);
    // 이틀 뒤에는 열흘 남았다. 마감 다음 날에는 사라진다.
    expect((await proposals.feed(userId, new Date("2026-11-17T03:00:00.000Z"))).proposals[0]?.subject.daysLeft).toBe(10);
    expect((await proposals.feed(userId, new Date("2026-11-27T03:00:00.000Z"))).proposals[0]?.subject.daysLeft).toBe(0);
    expect((await proposals.feed(userId, new Date("2026-11-28T03:00:00.000Z"))).proposals).toEqual([]);
  });

  it("관심 없다고 한 대상은 지워지고 다음 실행의 후보에서 빠진다", async () => {
    const w = world();
    const proposals = service(w);
    await proposals.enable(userId, at);
    await proposals.run(userId, "enable", at);
    const [proposal] = (await proposals.feed(userId, at)).proposals;
    expect((await proposals.dismiss(userId, proposal!.id, at)).proposals).toEqual([]);

    // 같은 공고가 다시 새로 들어와도 후보에 오르지 않으니 쓸 것이 없다.
    w.state.jobCreatedAt = "2026-11-16T00:00:00.000Z";
    const later = new Date("2026-11-16T03:00:00.000Z");
    await proposals.refresh(userId, later);
    expect(await proposals.run(userId, "manual", later)).toMatchObject({ status: "skipped", reason: "nothing_new" });
    expect(w.written).toHaveLength(1);
    await expect(proposals.dismiss(userId, randomUUID(), later)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("크레딧이 남지 않았거나 AI가 꺼져 있으면 실행하지 않고 그 까닭을 남긴다", async () => {
    const broke = world({ remaining: 0 });
    await service(broke).enable(userId, at);
    expect(await service(broke).run(userId, "enable", at)).toMatchObject({ status: "skipped", reason: "no_credits" });
    expect(broke.written).toHaveLength(0);
    expect((await service(broke).feed(userId, at)).run).toMatchObject({ status: "skipped", reason: "no_credits" });

    userId = randomUUID();
    const off = world();
    await service(off, null).enable(userId, at);
    expect(await service(off, null).run(userId, "enable", at)).toMatchObject({ status: "skipped", reason: "ai_unavailable" });
  });

  it("매일 실행은 켠 사용자에게 하루 한 번만 맡긴다", async () => {
    const w = world();
    const proposals = service(w);
    await proposals.enable(userId, at);
    await proposals.run(userId, "enable", at);

    w.state.jobCreatedAt = "2026-11-15T05:00:00.000Z";
    w.state.jobTechnologies = ["React", "Next.js"];
    const noon = new Date("2026-11-15T06:00:00.000Z");
    // 이 사용자가 포함된다(다른 테스트의 사용자도 켜져 있을 수 있어 수가 아니라 이 사용자의 상태를 본다).
    await proposals.requestDaily(noon);
    expect((await proposals.feed(userId, noon)).run).toMatchObject({ status: "queued", trigger: "daily" });
    // 이미 제안한 공고는 후보에서 빠져 쓸 것이 없지만, AI까지 가지 않은 날은 세지 않는다.
    expect(await proposals.run(userId, "daily", noon)).toMatchObject({ status: "skipped", reason: "nothing_new" });
    await proposals.requestDaily(noon);
    expect((await proposals.feed(userId, noon)).run.status).toBe("queued");

    // 관심 없다고 해서 자리가 비고 새 공고가 들어오면 AI까지 돈다. 그날은 다시 맡기지 않는다.
    await proposals.run(userId, "daily", noon);
    const feed = await mongoCollections(fixture.resource.db).proposalFeeds.findOne({ userId });
    await mongoCollections(fixture.resource.db).proposalFeeds.updateOne({ userId }, { $set: { proposals: [], seenThrough: new Date("2026-11-15T04:00:00.000Z") } });
    expect(feed?.autoRuns.daily).toBeNull();
    await proposals.requestDaily(noon);
    expect(await proposals.run(userId, "daily", noon)).toMatchObject({ status: "complete" });
    expect((await mongoCollections(fixture.resource.db).proposalFeeds.findOne({ userId }))?.autoRuns.daily).toBe("2026-11-15");
    await proposals.requestDaily(noon);
    expect((await proposals.feed(userId, noon)).run.status).toBe("complete");
  });

  it("새 소식 실행은 내 기술과 맞는 소식이 있을 때만 AI를 부른다", async () => {
    const w = world();
    const proposals = service(w);
    await proposals.enable(userId, at);
    await proposals.run(userId, "enable", at);
    await mongoCollections(fixture.resource.db).proposalFeeds.updateOne({ userId }, { $set: { proposals: [] } });

    // 새로 들어온 공고가 내 기술과 겹치지 않는다.
    w.state.jobCreatedAt = "2026-11-15T05:00:00.000Z";
    w.state.jobTechnologies = ["Java"];
    const noon = new Date("2026-11-15T06:00:00.000Z");
    await proposals.requestForNews(noon);
    expect(await proposals.run(userId, "news", noon)).toMatchObject({ status: "skipped", reason: "nothing_new" });
    expect(w.written).toHaveLength(1);

    // 같은 날 다음 수집에 맞는 공고가 오면 그때 돈다.
    w.state.jobTechnologies = ["React"];
    await proposals.requestForNews(noon);
    expect(await proposals.run(userId, "news", noon)).toMatchObject({ status: "complete", written: 1 });
    await proposals.requestForNews(noon);
    expect((await proposals.feed(userId, noon)).run.status).toBe("complete");
  });

  it("끝나지 못한 실행은 10분 뒤 실패로 보이고 다시 받을 수 있다", async () => {
    const w = world();
    const proposals = service(w);
    await proposals.enable(userId, at);
    await mongoCollections(fixture.resource.db).proposalFeeds.updateOne({ userId }, { $set: { "run.status": "running", "run.startedAt": at } });
    await expect(proposals.refresh(userId, new Date(at.getTime() + 60_000))).rejects.toMatchObject({ statusCode: 409 });

    const later = new Date(at.getTime() + 11 * 60_000);
    expect((await proposals.feed(userId, later)).run).toMatchObject({ status: "failed", reason: "failed" });
    expect((await proposals.refresh(userId, later)).run).toMatchObject({ status: "queued", trigger: "manual" });
  });

  it("끄면 제안이 지워지고 줄에 있던 실행은 돌지 않는다", async () => {
    const w = world();
    const proposals = service(w);
    await proposals.enable(userId, at);
    expect(await proposals.disable(userId, at)).toMatchObject({ enabled: false, proposals: [], run: { status: "idle" } });
    expect(await proposals.run(userId, "enable", at)).toMatchObject({ status: "skipped", written: 0 });
    expect(w.written).toHaveLength(0);
  });
});
