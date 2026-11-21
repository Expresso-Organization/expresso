import { randomUUID } from "node:crypto";

import { DEFAULT_JOB_COUNTRY, ProposalFeedSchema, type Activity, type CareerCategory, type CareerRecordListItem, type JobPostingSummary, type Proposal, type ProposalFeed, type ProposalRef, type ProposalRunReason, type ProposalTrigger } from "@expresso/contracts";
import { mongoCollections, type ProposalFeedDoc, type StoredProposal, type StoredProposalRun } from "@expresso/database";

import { HttpStatusError } from "../../api/plugins/auth-context.js";
import { addMongoOutboxEvent } from "../../platform/mongo-outbox.js";
import { inTransaction } from "../../platform/mongo-transaction.js";
import type { MongoContext } from "../../platform/mongodb.js";
import { daysUntil, seoulDate, type ActivityApi } from "../activities/index.js";
import { readableCareerProperties, type CareerApi } from "../career/index.js";
import { ConsentError, type ConsentApi } from "../consent/index.js";
import type { JobBoardApi } from "../jobs/index.js";
import { hasCandidates, hasRelevantNews, pickCandidates, type ActivityInput, type Candidates, type JobInput, type RecordInput } from "./candidates.js";
import { proposalStart } from "./prompts.js";
import type { ProposalWriter, WrittenProposal } from "./writer.js";

/** 실행이 이보다 오래 `running`이면 끝나지 못한 것으로 본다. 워커가 실행 도중 내려간 경우다. */
const RUN_TIMEOUT_MS = 10 * 60_000;
/** 저장해 두는 제안 수. 새 제안이 앞에 서고 넘치는 오래된 제안은 밀려난다. */
const STORED_PROPOSALS = 8;
/** 다시 제안하지 않는 대상의 수. 넘치면 오래된 것부터 잊는다. */
const DISMISSED_LIMIT = 500;
/** 목록 응답 한 장의 상한(계약의 `limit` 최댓값)과 새 공고를 찾을 때 읽는 장 수. */
const RECORD_PAGE = 100;
const JOB_PAGE = 50;
const JOB_PAGES = 2;
const ACTIVITY_PAGE = 100;

const IDLE_RUN: StoredProposalRun = { status: "idle", stage: null, reason: null, trigger: null, startedAt: null, finishedAt: null, read: null };

type ProposalDependencies = {
  career: Pick<CareerApi, "listRecords" | "listCategories" | "getJobGoal">;
  jobs: Pick<JobBoardApi, "list">;
  activities: Pick<ActivityApi, "list">;
  consent: Pick<ConsentApi, "require">;
  /** 요금제가 능동 제안을 여는가(`outreachGate`). 크레딧은 보지 않는다 — 능동 제안은 크레딧에서 빼지 않는다. */
  entitled(userId: string): Promise<boolean>;
  /** AI가 꺼져 있으면 null이다. 그때는 실행하지 않고 그 까닭을 남긴다. */
  writer: ProposalWriter | null;
};

/** 줄에 넣었거나 돌기 시작한 지 오래됐는데 끝나지 않은 실행인가. `startedAt`은 줄에 넣은 때, 돌기 시작하면 그때로 바뀐다. */
function isStale(run: StoredProposalRun, at: Date): boolean {
  return (run.status === "queued" || run.status === "running") && run.startedAt !== null && at.getTime() - run.startedAt.getTime() > RUN_TIMEOUT_MS;
}

/**
 * 저장한 제안을 지금 시각의 모양으로. 마감이 지났으면 null이다.
 * 메시지가 없는 것은 예전 모양(제목 문장과 설명 문단)으로 저장된 제안이라 내보내지 않는다 — 다음 실행 때 치워진다.
 */
function proposalView(stored: StoredProposal, at: Date): Proposal | null {
  if (typeof (stored as { message?: unknown }).message !== "string") return null;
  const daysLeft = stored.deadlineOn === null ? null : daysUntil(stored.deadlineOn, at);
  if (daysLeft !== null && daysLeft < 0) return null;
  const { deadlineOn: _deadlineOn, origin, ...rest } = stored;
  return {
    ...rest,
    subject: { ...stored.subject, daysLeft },
    start: proposalStart({
      action: stored.action,
      subject: { kind: stored.subject.kind, id: stored.subject.id, title: origin.title, ...(origin.host === null ? {} : { host: origin.host }), daysLeft },
      recordIds: origin.recordIds,
    }),
    createdAt: stored.createdAt.toISOString(),
  };
}

/** 요금제가 열지 않으면(`available`이 false) 켜 두었어도 꺼진 것으로 보인다. 저장된 켜짐과 제안은 지우지 않는다 — 요금제가 오르면 그대로 다시 보인다. */
function feedView(doc: ProposalFeedDoc | null, at: Date, available: boolean): ProposalFeed {
  if (!doc) return ProposalFeedSchema.parse({ available, enabled: false, proposals: [], run: { ...IDLE_RUN } });
  // 끝나지 못한 실행은 실패로 보인다. 다시 받을 수 있다.
  const run: StoredProposalRun = isStale(doc.run, at) ? { ...doc.run, status: "failed", stage: null, reason: "failed", finishedAt: at } : doc.run;
  const enabled = available && doc.enabled;
  return ProposalFeedSchema.parse({
    available,
    enabled,
    proposals: enabled ? doc.proposals.flatMap((proposal) => proposalView(proposal, at) ?? []) : [],
    // 요금제가 열지 않으면 실행 상태도 내보내지 않는다 — 줄에 남은 실행을 화면이 기다리며 되풀이해 읽지 않게 한다.
    run: available ? { ...run, startedAt: run.startedAt?.toISOString() ?? null, finishedAt: run.finishedAt?.toISOString() ?? null } : { ...IDLE_RUN },
  });
}

/** 남은 날을 마감일(서울 날짜)로 바꾼다. 목록은 남은 날만 주므로 읽은 날에 더해 구한다. */
function deadlineOn(daysLeft: number | null, at: Date): string | null {
  return daysLeft === null ? null : seoulDate(new Date(at.getTime() + daysLeft * 86_400_000));
}

function jobInput(job: JobPostingSummary): JobInput {
  return { id: job.id, title: job.title, company: job.company.name, avatar: { name: job.company.name, initial: job.company.initial ?? null, avatarBackground: job.company.avatarBackground ?? null, avatarColor: job.company.avatarColor ?? null, logoUrl: job.company.logoUrl ?? null }, family: job.family, technologies: job.technologies.map(({ name }) => name), daysLeft: job.daysLeft, createdAt: job.createdAt };
}

function subjectKey(subject: { kind: string; id: string }): string {
  return `${subject.kind}:${subject.id}`;
}

/**
 * 능동 제안.
 *
 * 켠 사용자에게만 돈다. 실행은 줄에 맡기고(`proposals.generate`) 워커가 `run`으로 받는다 —
 * 후보를 로직으로 고르고, 그 후보 안에서 모델이 고른 것만 저장한다. 실행 전에 요금제와 동의를 본다.
 * 서비스가 먼저 실행하는 일이라 사용자의 크레딧에서 빼지 않고(`UNMETERED_CONTRACTS`), 그 대신 유료 요금제에서만 돈다.
 */
export class ProposalService {
  readonly #deps: ProposalDependencies;

  constructor(readonly context: MongoContext, dependencies: ProposalDependencies) {
    this.#deps = dependencies;
  }

  get #feeds() {
    return mongoCollections(this.context.db).proposalFeeds;
  }

  async feed(userId: string, at = new Date()): Promise<ProposalFeed> {
    return feedView(await this.#feeds.findOne({ userId }), at, await this.#deps.entitled(userId));
  }

  async #requireEntitled(userId: string): Promise<void> {
    if (!(await this.#deps.entitled(userId))) throw new HttpStatusError(403, "proactive proposals require an upgraded plan");
  }

  /** 켠다. 커리어 기록을 AI에 넘기는 동의가 있어야 한다. 켜면 첫 실행을 줄에 넣는다. */
  async enable(userId: string, at = new Date()): Promise<ProposalFeed> {
    await this.#requireEntitled(userId);
    await this.#deps.consent.require(userId, "proposal_briefing");
    await this.#feeds.updateOne(
      { userId },
      {
        $set: { enabled: true, updatedAt: at },
        $setOnInsert: { _id: randomUUID(), proposals: [], dismissed: [], run: { ...IDLE_RUN }, autoRuns: { daily: null, news: null }, seenThrough: null, createdAt: at },
      },
      { upsert: true },
    );
    await this.#request(userId, "enable", at);
    return this.feed(userId, at);
  }

  /** 끈다. 저장된 제안을 지우고, 다시 제안하지 않는 대상은 남긴다 — 다시 켰을 때 같은 것을 또 권하지 않는다. */
  async disable(userId: string, at = new Date()): Promise<ProposalFeed> {
    await this.#feeds.updateOne({ userId }, { $set: { enabled: false, proposals: [], run: { ...IDLE_RUN }, updatedAt: at } });
    return this.feed(userId, at);
  }

  /** 「다시 받기」. 실행 중이면 409다. */
  async refresh(userId: string, at = new Date()): Promise<ProposalFeed> {
    await this.#requireEntitled(userId);
    const doc = await this.#feeds.findOne({ userId });
    if (!doc?.enabled) throw new HttpStatusError(409, "proposals are not enabled");
    if (!(await this.#request(userId, "manual", at))) throw new HttpStatusError(409, "a proposal run is already in progress");
    return this.feed(userId, at);
  }

  /** 「관심 없음」. 제안을 지우고 그 대상을 다시 제안하지 않는다. */
  /** 사용자가 「관심 없음」으로 넘긴 대상의 키(`job:<id>` · `activity:<id>` · `record:<id>`). 대화의 찾기가 같은 대상을 다시 권하지 않게 쓴다. */
  async dismissedKeys(userId: string): Promise<ReadonlySet<string>> {
    return new Set((await this.#feeds.findOne({ userId }, { projection: { dismissed: 1 } }))?.dismissed ?? []);
  }

  async dismiss(userId: string, proposalId: string, at = new Date()): Promise<ProposalFeed> {
    const doc = await this.#feeds.findOne({ userId });
    const proposal = doc?.proposals.find(({ id }) => id === proposalId);
    if (!doc || !proposal) throw new HttpStatusError(404, "proposal not found");
    const dismissed = [...doc.dismissed.filter((key) => key !== subjectKey(proposal.subject)), subjectKey(proposal.subject)].slice(-DISMISSED_LIMIT);
    await this.#feeds.updateOne({ userId }, { $set: { proposals: doc.proposals.filter(({ id }) => id !== proposalId), dismissed, updatedAt: at } });
    return this.feed(userId, at);
  }

  /** 켠 사용자마다 오늘의 실행을 줄에 넣는다. 예약 잡 `proposal_briefing`이 하루 한 번 부른다. */
  async requestDaily(at = new Date()): Promise<{ requested: number }> {
    return this.#requestAll("daily", at);
  }

  /**
   * 새 공고나 활동을 수집한 직후에 부른다. 오늘 새 소식 실행을 하지 않은 켠 사용자에게 맡긴다.
   * 그 소식이 사용자와 관련 있는지는 실행의 첫 단계가 로직으로 가른다 — 관련 없으면 AI를 부르지 않고 끝낸다.
   */
  async requestForNews(at = new Date()): Promise<{ requested: number }> {
    return this.#requestAll("news", at);
  }

  async #requestAll(trigger: "daily" | "news", at: Date): Promise<{ requested: number }> {
    const today = seoulDate(at);
    const users = await this.#feeds.find({ enabled: true, [`autoRuns.${trigger}`]: { $ne: today } }, { projection: { userId: 1 } }).toArray();
    let requested = 0;
    // 요금제가 열지 않는 사용자는 줄에 넣지 않는다. 켜 둔 채 무료가 된 계정이 여기에 걸린다.
    for (const { userId } of users) if (await this.#deps.entitled(userId) && await this.#request(userId, trigger, at)) requested += 1;
    return { requested };
  }

  /** 실행을 줄에 넣는다. 이미 줄에 있거나 실행 중이면 넣지 않고 false다. */
  async #request(userId: string, trigger: ProposalTrigger, at: Date): Promise<boolean> {
    const stale = new Date(at.getTime() - RUN_TIMEOUT_MS);
    return inTransaction(this.context, async (tx) => {
      const claimed = await mongoCollections(tx.db).proposalFeeds.updateOne(
        { userId, enabled: true, $or: [{ "run.status": { $nin: ["queued", "running"] } }, { "run.startedAt": { $lt: stale } }] },
        { $set: { run: { ...IDLE_RUN, status: "queued", trigger, startedAt: at }, updatedAt: at } },
        { session: tx.session },
      );
      if (!claimed.matchedCount) return false;
      await addMongoOutboxEvent(tx, { userId, topic: "proposals.generate", payload: { userId, trigger, requestedAt: at.toISOString() }, idempotencyKey: `proposals:${userId}:${trigger}:${at.getTime()}` });
      return true;
    });
  }

  /** 워커가 부른다. 줄에 넣은 실행 하나를 끝까지 돌리고 결과를 저장한다. */
  async run(userId: string, trigger: ProposalTrigger, at = new Date()): Promise<{ status: StoredProposalRun["status"]; reason: ProposalRunReason | null; written: number }> {
    const started = await this.#feeds.findOneAndUpdate(
      { userId, enabled: true, "run.status": "queued" },
      { $set: { "run.status": "running", "run.stage": "collecting", "run.startedAt": at, "run.finishedAt": null, updatedAt: at } },
      { returnDocument: "after" },
    );
    if (!started) return { status: "skipped", reason: null, written: 0 };
    const today = seoulDate(at);
    const finish = async (status: "complete" | "skipped" | "failed", reason: ProposalRunReason | null, extra: Partial<Pick<ProposalFeedDoc, "proposals" | "seenThrough">> & { read?: StoredProposalRun["read"]; counted?: boolean } = {}) => {
      const { read = null, counted = false, ...fields } = extra;
      await this.#feeds.updateOne({ userId, "run.status": "running" }, { $set: {
        run: { status, stage: null, reason, trigger, startedAt: at, finishedAt: new Date(), read },
        ...fields,
        // 자동 실행은 AI까지 돈 날만 센다. 관련 없는 소식으로 끝난 날은 다음 소식에 다시 볼 수 있다.
        ...(counted && (trigger === "daily" || trigger === "news") ? { [`autoRuns.${trigger}`]: today } : {}),
        updatedAt: new Date(),
      } });
      return { status, reason, written: fields.proposals ? fields.proposals.length - started.proposals.length : 0 };
    };

    try {
      // 줄에 넣은 뒤 요금제가 바뀌었을 수 있다. AI를 부르기 전에 다시 본다.
      if (!(await this.#deps.entitled(userId))) return await finish("skipped", "plan_required");
      if (!this.#deps.writer) return await finish("skipped", "ai_unavailable");
      try { await this.#deps.consent.require(userId, "proposal_briefing"); }
      catch (error) { if (error instanceof ConsentError) return await finish("skipped", "consent_required"); throw error; }

      const [{ candidates, read }, goal] = await Promise.all([this.#candidates(userId, started, at), this.#deps.career.getJobGoal(userId)]);
      const relevant = trigger === "news" ? hasRelevantNews(candidates) : hasCandidates(candidates);
      if (!relevant) return await finish("skipped", "nothing_new", { read, ...(trigger === "news" ? {} : { seenThrough: at }) });

      await this.#feeds.updateOne({ userId, "run.status": "running" }, { $set: { "run.stage": "writing" } });
      const written = await this.#deps.writer.write(userId, candidates, goal);
      const fresh = written.map((draft) => this.#proposal(draft, candidates, at));
      const freshKeys = new Set(fresh.map(({ subject }) => subjectKey(subject)));
      const current = (await this.#feeds.findOne({ userId }))?.proposals ?? started.proposals;
      // 마감이 지난 제안은 이때 치운다. 읽을 때는 보이지 않게만 한다.
      const alive = current.filter((proposal) => proposalView(proposal, at) !== null && !freshKeys.has(subjectKey(proposal.subject)));
      const proposals = [...fresh, ...alive].slice(0, STORED_PROPOSALS);
      // 에이전트가 읽고도 권할 것을 고르지 않았으면 그렇다고 남긴다 — 화면이 까닭 없이 비어 보이지 않게 한다.
      return await finish("complete", fresh.length === 0 ? "nothing_new" : null, { proposals, seenThrough: at, read, counted: true });
    } catch {
      return await finish("failed", "failed");
    }
  }

  async #candidates(userId: string, doc: ProposalFeedDoc, at: Date): Promise<{ candidates: Candidates; read: NonNullable<StoredProposalRun["read"]> }> {
    const [categories, records, watched, activities, ...pages] = await Promise.all([
      this.#deps.career.listCategories(userId) as Promise<CareerCategory[]>,
      this.#deps.career.listRecords(userId, { sort: "updated_desc", limit: RECORD_PAGE }),
      this.#deps.jobs.list(userId, { interested: true, sort: "deadline", page: 1, limit: JOB_PAGE }),
      this.#deps.activities.list({ limit: ACTIVITY_PAGE, sort: "fresh" }, at),
      ...Array.from({ length: JOB_PAGES }, (_, index) => this.#deps.jobs.list(userId, { deadline: "open", sort: "recent", country: DEFAULT_JOB_COUNTRY, page: index + 1, limit: JOB_PAGE })),
    ]);
    const byCategory = new Map(categories.map((category) => [category.id, category]));
    const recordInputs: RecordInput[] = (records.data as CareerRecordListItem[]).map((record) => {
      const category = byCategory.get(record.categoryId);
      return {
        id: record.id,
        title: record.title,
        categoryKey: record.categoryKey,
        categoryName: category?.name ?? record.categoryKey,
        bodyMd: record.bodyMd,
        properties: readableCareerProperties(record.properties, category?.propertySchemaV2 ?? []),
        isEmpty: record.isEmpty,
      };
    });
    const jobs = pages.flatMap((page) => (page.data as JobPostingSummary[]).map(jobInput));
    const activityInputs: ActivityInput[] = (activities as Activity[]).map(({ id, kind, title, host, fields, url, daysLeft, firstSeenAt }) => ({ id, kind, title, host, fields, url, daysLeft, firstSeenAt }));
    const candidates = pickCandidates({
      records: recordInputs,
      jobs,
      watched: (watched.data as JobPostingSummary[]).map(jobInput),
      activities: activityInputs,
      seenThrough: doc.seenThrough,
      exclude: new Set([...doc.dismissed, ...doc.proposals.map(({ subject }) => subjectKey(subject))]),
    });
    return { candidates, read: { records: recordInputs.length, jobs: jobs.length, activities: activityInputs.length } };
  }

  /** 모델이 고른 제안에 화면이 쓸 자료(대상 · 근거 기록과 그 표시)를 붙인다. */
  #proposal(draft: WrittenProposal, candidates: Candidates, at: Date): StoredProposal {
    const none = { company: null, categoryKey: null, activityKind: null } as const;
    const record = (id: string): ProposalRef | null => {
      const found = candidates.records.find((item) => item.id === id) ?? candidates.weakRecords.find((item) => item.id === id);
      return found ? { ...none, kind: "record", id, label: found.title, sub: found.categoryName.slice(0, 200), href: `/career/records/${id}`, external: false, daysLeft: null, categoryKey: found.categoryKey } : null;
    };
    const job = candidates.jobs.find(({ id }) => draft.subject.kind === "job" && id === draft.subject.id);
    const activity = candidates.activities.find(({ id }) => draft.subject.kind === "activity" && id === draft.subject.id);
    const subject: ProposalRef = job
      ? { ...none, kind: "job", id: job.id, label: job.title.slice(0, 400), sub: job.company.slice(0, 200), href: `/jobs/${job.id}`, external: false, daysLeft: job.daysLeft, company: job.avatar }
      : activity
        ? { ...none, kind: "activity", id: activity.id, label: activity.title, sub: activity.host.slice(0, 200) || null, href: activity.url, external: true, daysLeft: activity.daysLeft, activityKind: activity.kind }
        : record(draft.subject.id) ?? { ...none, kind: "record", id: draft.subject.id, label: "기록", sub: null, href: `/career/records/${draft.subject.id}`, external: false, daysLeft: null };
    return {
      id: randomUUID(),
      action: draft.action,
      message: draft.message,
      subject,
      records: draft.recordIds.flatMap((id) => record(id) ?? []),
      deadlineOn: deadlineOn(job?.daysLeft ?? activity?.daysLeft ?? null, at),
      origin: { title: job?.title ?? activity?.title ?? subject.label, host: activity?.host ?? null, recordIds: draft.recordIds },
      createdAt: at,
    };
  }
}
