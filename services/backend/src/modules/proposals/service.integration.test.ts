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
function world(overrides: { entitled?: boolean; consent?: boolean; jobCreatedAt?: string } = {}) {
  const state = { entitled: overrides.entitled ?? true, consent: overrides.consent ?? true, jobCreatedAt: overrides.jobCreatedAt ?? "2026-11-15T00:00:00.000Z", jobTechnologies: ["React"], goal: null as { work: string; place: string; timing: string; source: "app"; updatedAt: string } | null };
  const written: Candidates[] = [];
  const goals: unknown[] = [];
  const writer: ProposalWriter = {
    async write(_userId, candidates, goal) {
      written.push(candidates);
      goals.push(goal ?? null);
      return candidates.jobs.map((job): WrittenProposal => ({ subject: { kind: "job", id: job.id }, action: "compare_job", message: "모아마켓의 「프론트엔드 개발자」 공고 요건을 React 사용 기록과 대조해 볼까요?", recordIds: [RECORD_ID] }));
    },
  };
  const dependencies = {
    career: {
      getJobGoal: async () => state.goal,
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
    entitled: async () => state.entitled,
  };
  return { state, written, goals, writer, dependencies };
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
      message: "모아마켓의 「프론트엔드 개발자」 공고 요건을 React 사용 기록과 대조해 볼까요?",
      // 화면이 대상을 그리는 데 쓰는 것 — 공고는 회사 아바타, 기록은 서랍.
      subject: { kind: "job", id: JOB_ID, label: "프론트엔드 개발자", sub: "모아마켓", href: `/jobs/${JOB_ID}`, daysLeft: 12, company: { name: "모아마켓", initial: null, avatarBackground: null, avatarColor: null, logoUrl: null }, categoryKey: null, activityKind: null },
      records: [{ kind: "record", id: RECORD_ID, label: "React · Next.js", sub: "스킬 · 도구", categoryKey: "skill_tool", company: null, activityKind: null }],
      start: { kind: "chat", label: "요건을 대조해 주세요", contexts: [{ kind: "job", id: JOB_ID }, { kind: "record", id: RECORD_ID }] },
    });
    // 메시지는 화면에만 쓴다. 대화로 넘기는 요청문에는 싣지 않는다.
    expect(JSON.stringify(feed.proposals[0]?.start)).not.toContain("모아마켓");
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

  it("적어 둔 구직 목표를 작성기에 넘기고, 없으면 없다고 넘긴다", async () => {
    const w = world();
    const proposals = service(w);
    await proposals.enable(userId, at);
    await proposals.run(userId, "enable", at);
    expect(w.goals).toEqual([null]);

    w.state.goal = { work: "커머스 프론트엔드", place: "", timing: "내년 상반기", source: "app", updatedAt: at.toISOString() };
    w.state.jobCreatedAt = "2026-11-16T00:00:00.000Z";
    const later = new Date("2026-11-16T03:00:00.000Z");
    await mongoCollections(fixture.resource.db).proposalFeeds.updateOne({ userId }, { $set: { proposals: [] } });
    await proposals.refresh(userId, later);
    await proposals.run(userId, "manual", later);
    expect(w.goals[1]).toMatchObject({ work: "커머스 프론트엔드", timing: "내년 상반기" });
  });

  it("에이전트가 권할 것을 고르지 않으면 까닭을 남기고, AI까지 돈 실행으로 센다", async () => {
    const w = world();
    const nothing: ProposalWriter = { async write() { return []; } };
    const proposals = service(w, nothing);
    await proposals.enable(userId, at);
    expect(await proposals.run(userId, "enable", at)).toMatchObject({ status: "complete", reason: "nothing_new", written: 0 });
    expect(await proposals.feed(userId, at)).toMatchObject({ proposals: [], run: { status: "complete", reason: "nothing_new", read: { records: 1, jobs: 1, activities: 0 } } });
  });

  it("예전 모양으로 저장된 제안은 내보내지 않고, 다음 실행 때 치운다", async () => {
    const w = world();
    const proposals = service(w);
    await proposals.enable(userId, at);
    // 제목 문장과 설명 문단을 쓰던 때의 문서.
    const old = { id: randomUUID(), action: "compare_job", title: "요건을 대조해 보세요", reason: "「가계부 PWA」 경험이 이어집니다.", subject: { kind: "job", id: randomUUID(), label: "옛 공고", href: "/jobs/old", external: false, daysLeft: null }, records: [], deadlineOn: null, origin: { title: "옛 공고", host: null, recordIds: [] }, createdAt: at };
    await mongoCollections(fixture.resource.db).proposalFeeds.updateOne({ userId }, { $set: { proposals: [old as never] } });
    expect((await proposals.feed(userId, at)).proposals).toEqual([]);

    await proposals.run(userId, "enable", at);
    const stored = await mongoCollections(fixture.resource.db).proposalFeeds.findOne({ userId });
    expect(stored?.proposals.map(({ subject }) => subject.id)).toEqual([JOB_ID]);
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

  it("요금제가 열지 않으면 켜지도 다시 받지도 못한다. 켜 둔 채 무료가 된 계정은 꺼진 것으로 보이고 실행과 줄 넣기를 건너뛴다", async () => {
    const free = world({ entitled: false });
    await expect(service(free).enable(userId, at)).rejects.toMatchObject({ statusCode: 403 });
    expect(await service(free).feed(userId, at)).toMatchObject({ available: false, enabled: false, proposals: [] });
    expect(await outbox()).toHaveLength(0);

    // 유료일 때 켜고 제안을 받은 뒤 무료가 된다.
    free.state.entitled = true;
    await service(free).enable(userId, at);
    expect(await service(free).run(userId, "enable", at)).toMatchObject({ status: "complete" });
    expect(await service(free).feed(userId, at)).toMatchObject({ available: true, enabled: true });
    expect((await service(free).feed(userId, at)).proposals).toHaveLength(1);
    free.state.entitled = false;
    expect(await service(free).feed(userId, at)).toMatchObject({ available: false, enabled: false, proposals: [], run: { status: "idle" } });
    await expect(service(free).refresh(userId, at)).rejects.toMatchObject({ statusCode: 403 });
    const queued = (await outbox()).length;
    const tomorrow = new Date(at.getTime() + 86_400_000);
    await service(free).requestDaily(tomorrow);
    await service(free).requestForNews(tomorrow);
    expect(await outbox()).toHaveLength(queued);
    // 끄기는 요금제와 무관하게 된다.
    await expect(service(free).disable(userId, tomorrow)).resolves.toMatchObject({ enabled: false });

    // 줄에 넣은 뒤 요금제가 바뀐 실행은 AI를 부르지 않고 까닭을 남긴다.
    userId = randomUUID();
    const changed = world();
    await service(changed).enable(userId, at);
    changed.state.entitled = false;
    expect(await service(changed).run(userId, "enable", at)).toMatchObject({ status: "skipped", reason: "plan_required" });
    expect(changed.written).toHaveLength(0);
    // 저장된 켜짐은 지우지 않는다. 요금제가 오르면 다시 켜지 않아도 보인다.
    changed.state.entitled = true;
    expect(await service(changed).feed(userId, at)).toMatchObject({ available: true, enabled: true, run: { status: "skipped", reason: "plan_required" } });
  });

  it("AI가 꺼져 있으면 실행하지 않고 그 까닭을 남긴다. 남은 크레딧은 보지 않는다", async () => {

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
