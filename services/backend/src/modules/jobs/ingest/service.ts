import { randomUUID } from "node:crypto";
import { Binary } from "mongodb";
import { CreateJobSourceSchema, JobIngestRunSchema, JobSourceSchema, PostingFactsRunSchema, type CreateJobSource, type PostingFactsRun } from "@expresso/contracts";
import { mongoCollections, type JobPostingDoc, type JobSourceDoc } from "@expresso/database";
import type { MongoContext } from "../../../platform/mongodb.js";
import { inTransaction } from "../../../platform/mongo-transaction.js";
import type { JobIngestApi } from "./index.js";
import { JobMarketError } from "../errors.js";
import { escapeSearch, experienceMinYears, postingDedupeHash, sha256 } from "../mongo-queries.js";
import { readFetchOutcome, type FetchScope, type JobSourceAdapter, type PostingRefresh, type RawPosting } from "./adapter.js";
import type { FactsReader } from "./facts.js";
import { publicUrl, type MarkReader } from "./logo.js";
import { classifyFamily, isOpening, normalizeRegion, TARGET_FAMILIES, type JobFamily } from "./classify.js";

function mapSource(source: JobSourceDoc) {
  return JobSourceSchema.parse({ id: source._id, provider: source.provider, token: source.token, displayName: source.displayName, active: source.isActive, lastRunAt: source.lastRunAt?.toISOString() ?? null, lastStatus: source.lastStatus ?? null, lastError: source.lastError ?? null, lastSeenCount: source.lastSeenCount, lastAddedCount: source.lastAddedCount, siteUrl: source.siteUrl ?? null });
}

export class JobIngestService implements JobIngestApi {
  readonly adapters: Map<string, JobSourceAdapter>;
  constructor(readonly context: MongoContext, adapters: JobSourceAdapter[], readonly facts: FactsReader | null = null, readonly marks: MarkReader | null = null) { this.adapters = new Map(adapters.map((adapter) => [adapter.provider, adapter])); }

  async listSources() { return (await mongoCollections(this.context.db).jobSources.find({}).sort({ provider: 1, displayName: 1 }).toArray()).map(mapSource); }

  async addSource(inputValue: CreateJobSource) {
    const input = CreateJobSourceSchema.parse(inputValue);
    if (!this.adapters.has(input.provider)) throw new JobMarketError(422, `no adapter for ${input.provider}`);
    const source = await mongoCollections(this.context.db).jobSources.findOneAndUpdate({ provider: input.provider, token: input.token }, {
      $set: { displayName: input.displayName, isActive: true, ...(input.siteUrl ? { siteUrl: input.siteUrl } : {}) },
      $setOnInsert: { _id: randomUUID(), provider: input.provider, token: input.token, lastSeenCount: 0, lastAddedCount: 0, createdAt: new Date() },
    }, { upsert: true, returnDocument: "after" });
    if (!source) throw new Error("job source was not persisted");
    return mapSource(source);
  }

  async run(at = new Date(), only?: string[]) {
    const db = mongoCollections(this.context.db);
    const sources = await db.jobSources.find({ isActive: true, ...(only?.length ? { _id: { $in: only } } : {}) }).sort({ provider: 1, token: 1 }).toArray();
    const results: { sourceId: string; provider: JobSourceDoc["provider"]; displayName: string; seen: number; added: number; skipped: number; error: string | null }[] = [];
    for (const source of sources) {
      const adapter = this.adapters.get(source.provider);
      let seen = 0; let added = 0; let error: string | null = null;
      try {
        if (!adapter) throw new Error("adapter not configured");
        // 외부 HTTP 호출은 트랜잭션 밖에서 한 번만 실행합니다.
        const scope = await this.#fetchScope(source);
        const { postings, refresh, skippedUnwanted } = readFetchOutcome(
          await adapter.fetch(source.token, source.displayName, scope),
        );
        // 건너뛴 것까지 센다. 이 수가 `lastSeenCount`로 남아 화면이 어디서
        // 모으는지 고르는 데 쓰인다 — 증분으로 줄어들면 그 문구가 흔들린다.
        seen = postings.length + refresh.length + skippedUnwanted;
        for (const entry of refresh) await this.#refresh(source, entry);
        for (const posting of postings) {
          if (posting.descriptionRaw.length < 200 || !isOpening(posting)) continue;
          const family = classifyFamily(posting.title, posting.team);
          if (!family || !TARGET_FAMILIES.includes(family)) continue;
          if (await this.#store(source, posting, family)) added++;
        }
        const host = source.siteUrl ? publicUrl(source.siteUrl)?.hostname : null;
        if (host) {
          const companyIds = await db.jobPostings.distinct("companyId", { externalId: { $regex: `^${escapeSearch(`${source.provider}:${source.token}:`)}` } });
          await db.companies.updateMany({ _id: { $in: companyIds }, domain: null }, { $set: { domain: host } });
        }
      } catch (caught) { error = (caught instanceof Error ? caught.message : "unknown").slice(0, 300); seen = 0; added = 0; }
      await db.jobSources.updateOne({ _id: source._id }, { $set: { lastRunAt: at, lastStatus: error ? "failed" : "succeeded", lastError: error, lastSeenCount: seen, lastAddedCount: added } });
      results.push({ sourceId: source._id, provider: source.provider, displayName: source.displayName, seen, added, skipped: seen - added, error });
    }
    const logosRead = await this.#readLogos();
    return JobIngestRunSchema.parse({ startedAt: at.toISOString(), finishedAt: new Date().toISOString(), sources: results, totals: { seen: results.reduce((sum, item) => sum + item.seen, 0), added: results.reduce((sum, item) => sum + item.added, 0), failedSources: results.filter((item) => item.error !== null).length, logosRead } });
  }

  /**
   * 어댑터가 상세를 열기 전에 물어볼 것.
   *
   * 이미 들인 `externalId`와, 제목·직무만으로 들일 생각이 있는지를 준다.
   * 저장소는 앞에 `provider:token:`을 붙여 두므로 떼어서 넘긴다 — 어댑터는
   * 자기가 내놓은 모양으로만 자기 공고를 안다.
   */
  async #fetchScope(source: JobSourceDoc): Promise<FetchScope> {
    const prefix = `${source.provider}:${source.token}:`;
    const ids = await mongoCollections(this.context.db).jobPostings.distinct("externalId", {
      externalId: { $regex: `^${escapeSearch(prefix)}` },
    });
    const bare = new Set(ids.map((id) => String(id).slice(prefix.length)));
    return {
      // **들인 것만 안다.** 제목은 통과했는데 본문이 짧아 버려진 공고는 여기
      // 없어서 다음 실행에 다시 상세를 연다. 실측(고용24 소프트웨어 직종)에서
      // 두 번째 실행이 78회였고 그중 73회가 이것이다. 더 줄이려면 "봤지만
      // 안 들였다"를 따로 남겨야 하는데, 그건 저장소가 늘어나는 일이라
      // 여기서는 하지 않는다 — 하루 한 번에 78회면 충분히 낮다.
      isKnown: (externalId) => bare.has(externalId),
      // 아래 저장 경로가 거는 것과 **같은 규칙**이다. 여기서 갈리면 상세를
      // 받아 놓고 버리거나, 받아야 할 것을 건너뛴다.
      wants: (title, team) => {
        if (!isOpening({ title, team, location: null })) return false;
        const family = classifyFamily(title, team);
        return family !== null && TARGET_FAMILIES.includes(family);
      },
    };
  }

  /**
   * 이미 들인 공고에 분류를 다시 붙인다.
   *
   * 본문은 건드리지 않는다 — 한 번 넣으면 고칠 수 없고(0002), 요건의 근거
   * 구간이 그 글의 문자 위치를 가리킨다. **갈래와 지역은 우리 규칙이 읽은
   * 값**이라 규칙이 나아지면 따라와야 하고, 마감은 사실이라 바뀌면 따라간다.
   */
  async #refresh(source: JobSourceDoc, entry: PostingRefresh): Promise<void> {
    const family = classifyFamily(entry.title, entry.team);
    if (!family || !TARGET_FAMILIES.includes(family)) return;
    const externalId = `${source.provider}:${source.token}:${entry.externalId}`;
    await mongoCollections(this.context.db).jobPostings.updateOne(
      { source: "api", externalId },
      {
        $set: {
          jobFamily: family,
          ...(entry.location === null ? {} : { locationRegion: normalizeRegion(entry.location) }),
          ...(entry.expiresAt === null ? {} : { expiresAt: entry.expiresAt }),
        },
      },
    );
  }

  async #store(source: JobSourceDoc, posting: RawPosting, family: JobFamily): Promise<boolean> {
    const externalId = `${source.provider}:${source.token}:${posting.externalId}`;
    const hash = postingDedupeHash(posting.companyName, posting.title, posting.descriptionRaw);
    const persist = () => inTransaction(this.context, async (tx) => {
      const db = mongoCollections(tx.db); const options = { session: tx.session };
      const existing = await db.jobPostings.findOne({ $or: [{ source: "api", externalId }, { dedupeHash: hash }] }, options);
      if (existing) {
        await db.jobPostings.updateOne({ _id: existing._id }, { $set: { jobFamily: family, locationRegion: normalizeRegion(posting.location), ...(posting.expiresAt ? { expiresAt: posting.expiresAt } : {}) } }, options);
        return false;
      }
      const companyKey = sha256(`${posting.companyName.normalize("NFKC").toLocaleLowerCase("en-US")}:`);
      const company = await db.companies.findOneAndUpdate({ dedupeKey: companyKey }, { $setOnInsert: { _id: randomUUID(), name: posting.companyName, dedupeKey: companyKey, brandColors: [] } }, { ...options, upsert: true, returnDocument: "after" });
      if (!company) throw new Error("company was not persisted");
      const host = source.siteUrl ? publicUrl(source.siteUrl)?.hostname : null;
      if (host) await db.companies.updateOne({ _id: company._id, domain: null }, { $set: { domain: host } }, options);
      const row: JobPostingDoc = { _id: randomUUID(), companyId: company._id, source: "api", externalId, title: posting.title, descriptionRaw: posting.descriptionRaw, requirements: {}, dedupeHash: hash, sourceUrl: posting.sourceUrl, sourceBoard: source.displayName, location: posting.location, locationRegion: normalizeRegion(posting.location), employmentType: posting.employmentType, experienceLabel: posting.experienceLabel, experienceMinYears: experienceMinYears(null, posting.experienceLabel), team: posting.team, jobFamily: family, expiresAt: posting.expiresAt, createdAt: new Date(), duties: [], preferred: [], hiringProcess: [] };
      await db.jobPostings.insertOne(row, options);
      return true;
    });
    // 서로 다른 출처의 동시 insert도 고유 키를 기준으로 새 snapshot에서 다시 판정합니다.
    for (let attempt = 0; ; attempt++) {
      try { return await persist(); }
      catch (error) { if ((error as { code?: number })?.code !== 11000 || attempt >= 2) throw error; }
    }
  }

  async #readLogos() {
    if (!this.marks) return 0;
    const companies = mongoCollections(this.context.db).companies;
    let read = 0;
    for await (const company of companies.find({ logoReadAt: null, domain: { $type: "string" } })) {
      let mark = null;
      try { mark = await this.marks.read(`https://${company.domain}`); } catch { /* 로고 실패도 마지막 확인 시각을 남깁니다. */ }
      await companies.updateOne({ _id: company._id, logoReadAt: null }, { $set: { logoData: mark ? new Binary(mark.bytes) : null, logoMediaType: mark?.mediaType ?? null, logoSourceUrl: mark?.sourceUrl ?? null, logoChecksum: mark?.checksum ?? null, logoReadAt: new Date() } });
      if (mark) read++;
    }
    return read;
  }

  async readPendingFacts(limit = 25, at = new Date()): Promise<PostingFactsRun> {
    if (!Number.isSafeInteger(limit) || limit < 1) throw new RangeError("facts batch limit must be positive");
    const postings = mongoCollections(this.context.db).jobPostings;
    let read = 0; let failed = 0;
    if (this.facts) {
      const pending = await postings.find({ factsReadAt: null }).sort({ createdAt: 1, _id: 1 }).limit(limit).toArray();
      const reader = this.facts;
      await Promise.all(Array.from({ length: 4 }, async () => {
        for (;;) {
          const posting = pending.pop(); if (!posting) return;
          let facts;
          try { facts = await reader.read(posting.descriptionRaw); } catch { failed++; continue; }
          // 출처 값은 보존합니다. 외부 호출 뒤에 현재 값을 읽어 저장하므로 동시 갱신을 덮지 않습니다.
          await inTransaction(this.context, async (tx) => {
            const collection = mongoCollections(tx.db).jobPostings;
            const current = await collection.findOne({ _id: posting._id, factsReadAt: null }, { session: tx.session });
            if (!current) return;
            const experienceNote = current.experienceNote ?? facts.experienceNote;
            await collection.updateOne({ _id: current._id, factsReadAt: null }, { $set: { salaryNote: current.salaryNote ?? facts.salaryNote, experienceNote, workType: current.workType ?? facts.workType, factsReadAt: new Date(), experienceMinYears: experienceMinYears(experienceNote, current.experienceLabel) } }, { session: tx.session });
          });
          read++;
        }
      }));
    }
    return PostingFactsRunSchema.parse({ startedAt: at.toISOString(), finishedAt: new Date().toISOString(), read, failed, pending: await postings.countDocuments({ factsReadAt: null }), skipped: this.facts ? null : "reader is not configured" });
  }
}

export { JobIngestService as MongoJobIngestService };
