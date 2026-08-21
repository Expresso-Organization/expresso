import { createHash } from "node:crypto";

import {
  AnalyzedJobPostingSchema,
  ExplainableMatchSchema,
  JobDemandSummarySchema,
  JobRequirementsSchema,
  SavedJobSearchSchema,
  SubmittedJobPostingSchema,
  type JobRequirements,
  type JobSearchCondition,
  type SaveJobSearch,
  type SubmitJobPosting,
  type UpsertJobInterest,
} from "@expresso/contracts";
import type { SqlTag, JSONValue } from "../../platform/mysql.js";

import { addOutboxEvent } from "../../platform/outbox.js";
import { JobMarketError } from "./errors.js";
import { calculateExplainableMatch } from "./match-score.js";
import { interpretSearchQuery } from "./search-parser.js";

interface IdRow {
  id: string;
}

interface PostingRow extends IdRow {
  requirements: Record<string, unknown>;
}

interface AnalysisRow extends IdRow {
  input_request_hash: string | null;
}

interface SavedSearchRow {
  id: string;
  name: string;
  query_text: string;
  filters: { conditions?: JobSearchCondition[] };
  notify: boolean;
  created_at: Date | string;
}

interface RecordSearchRow {
  title: string;
  body_md: string;
  properties: Record<string, unknown>;
}

interface RequirementPostingRow {
  id: string;
  requirements: Record<string, unknown>;
}

interface CountRow {
  count: number;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeSource(input: SubmitJobPosting): string {
  return [input.companyName, input.title, input.descriptionRaw]
    .map((value) => value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US"))
    .join("\n");
}

function mapSavedSearch(row: SavedSearchRow) {
  return SavedJobSearchSchema.parse({
    id: row.id,
    name: row.name,
    originalQuery: row.query_text,
    conditions: row.filters.conditions ?? [],
    notify: row.notify,
    createdAt: new Date(row.created_at).toISOString(),
  });
}

export class JobMarketService {
  readonly #sql: SqlTag;

  constructor(sql: SqlTag) {
    this.#sql = sql;
  }

  async submitPosting(
    userId: string,
    idempotencyKey: string,
    input: SubmitJobPosting,
  ) {
    const dedupeHash = sha256(normalizeSource(input));
    const companyKey = sha256(
      `${input.companyName.normalize("NFKC").toLocaleLowerCase("en-US")}:${input.companyDomain?.toLocaleLowerCase("en-US") ?? ""}`,
    );
    const inputHash = sha256(JSON.stringify({ dedupeHash, sourceUrl: input.sourceUrl ?? null }));

    return this.#sql.begin(async (transaction) => {
      await transaction`
        insert into company (name, domain, dedupe_key)
        values (${input.companyName}, ${input.companyDomain ?? null}, ${companyKey})
        as new on duplicate key update name = company.name
      `;
      const companies = await transaction<IdRow[]>`
        select id from company where dedupe_key = ${companyKey}
      `;
      const companyId = companies[0]?.id;
      if (!companyId) throw new Error("job company was not persisted");

      const insertedPostings = await transaction<PostingRow[]>`
        insert ignore into job_posting (
          company_id, source, title, description_raw,
          source_url, dedupe_hash, requirements
        )
        values (
          ${companyId}, 'user_input', ${input.title}, ${input.descriptionRaw},
          ${input.sourceUrl ?? null}, ${dedupeHash}, '{}'
        )
          
        returning id, requirements
      `;
      const insertedPosting = insertedPostings[0];
      const posting = insertedPosting ?? (await transaction<PostingRow[]>`
        select id, requirements from job_posting where dedupe_hash = ${dedupeHash}
      `)[0];
      if (!posting) throw new Error("job posting was not persisted");

      // 같은 멱등 키로 다시 들어오면 새 줄이 생기지 않는다 — 넣고 나서 그 키로 읽는다.
      await transaction`
        insert ignore into job_analysis (
          user_id, job_posting_id, input_type,
          status, input_idempotency_key, input_request_hash
        )
        values (
          ${userId}, ${posting.id}, ${input.sourceUrl ? "url" : "paste"},
          'queued', ${idempotencyKey}, ${inputHash}
        )
      `;
      const analysis = (await transaction<AnalysisRow[]>`
        select id, input_request_hash from job_analysis
        where user_id = ${userId} and input_idempotency_key = ${idempotencyKey}
      `)[0];
      if (!analysis) throw new Error("job analysis was not persisted");
      if (analysis.input_request_hash !== inputHash) {
        throw new JobMarketError(409, "idempotency key was reused with another posting");
      }

      await addOutboxEvent(transaction, {
        topic: "job.normalize",
        payload: {
          jobAnalysisId: analysis.id,
          jobPostingId: posting.id,
          userId,
        },
        idempotencyKey: `job-normalize:${analysis.id}`,
      });
      return SubmittedJobPostingSchema.parse({
        jobPostingId: posting.id,
        jobAnalysisId: analysis.id,
        status: "queued",
        deduplicated: !insertedPosting,
      });
    });
  }

  /**
   * 게시판에 있는 공고를 내 분석으로 가져온다.
   *
   * 06b의 "이 공고로 포트폴리오 만들기"가 여기로 온다. 본문을 다시 보내지
   * 않는 것이 중요하다 — `submitPosting`은 본문 해시로 공고를 찾는데, 모아 온
   * 공고의 해시는 그 계산에서 나온 것이 아니라 같은 공고가 두 벌 생긴다.
   *
   * 분석은 **공고당 한 벌**이다. 이미 있으면 그것을 돌려준다 — 두 벌이면
   * 요건도 커버리지도 어느 쪽이 내 것인지 말할 수 없고, 무엇보다 이미 끝난
   * 분석을 다시 돌리는 것은 사용자가 부탁한 적 없는 일이다.
   */
  async analyzePosting(userId: string, jobPostingId: string) {
    return this.#sql.begin(async (transaction) => {
      const posting = (await transaction<IdRow[]>`
        select id from job_posting where id = ${jobPostingId}
      `)[0];
      if (!posting) throw new JobMarketError(404, "job posting not found");

      const existing = (await transaction<{ id: string; status: string }[]>`
        select id, status from job_analysis
        where user_id = ${userId} and job_posting_id = ${jobPostingId}
        order by id limit 1
      `)[0];
      if (existing) {
        return AnalyzedJobPostingSchema.parse({
          jobPostingId,
          jobAnalysisId: existing.id,
          status: existing.status,
          reused: true,
        });
      }

      const analysis = (await transaction<IdRow[]>`
        insert into job_analysis (user_id, job_posting_id, input_type, status)
        values (${userId}, ${jobPostingId}, 'board', 'queued')
        returning id
      `)[0];
      if (!analysis) throw new Error("job analysis was not persisted");

      await addOutboxEvent(transaction, {
        topic: "job.normalize",
        payload: { jobAnalysisId: analysis.id, jobPostingId, userId },
        idempotencyKey: `job-normalize:${analysis.id}`,
      });
      return AnalyzedJobPostingSchema.parse({
        jobPostingId,
        jobAnalysisId: analysis.id,
        status: "queued",
        reused: false,
      });
    });
  }

  async interpretSearch(userId: string, query: string, resultCount: number) {
    const conditions = interpretSearchQuery(query);

    // 같은 검색을 다시 해석하면(00b를 새로고침하면) 최근 검색이 한 줄씩
    // 늘어난다. 방금 한 검색과 같은 말이면 그 줄을 갱신한다.
    // MySQL 은 고치는 표를 부속 질의에서 다시 읽지 못한다 — 대상을 먼저 찾는다.
    const latest = (await this.#sql<IdRow[]>`
      select id from recent_search
      where user_id = ${userId}
      order by created_at desc, id desc
      limit 1
    `)[0];
    const repeated = latest
      ? await this.#sql<IdRow[]>`
          update recent_search set
            conditions = ${this.#sql.json(conditions as JSONValue)},
            result_count = ${resultCount},
            created_at = now(6)
          where id = ${latest.id} and query_text = ${query}
          returning id
        `
      : [];
    if (repeated[0]) {
      return {
        originalQuery: query,
        conditions,
        needsClarification: conditions.length === 0,
        ...(conditions.length === 0
          ? { example: "서울의 3년 이상 TypeScript 백엔드 원격 채용" }
          : {}),
        recentSearchId: repeated[0].id,
      };
    }

    const rows = await this.#sql<IdRow[]>`
      insert into recent_search (user_id, query_text, conditions, result_count)
      values (
        ${userId}, ${query},
        ${this.#sql.json(conditions as JSONValue)}, ${resultCount}
      )
      returning id
    `;
    const recentSearchId = rows[0]?.id;
    if (!recentSearchId) throw new Error("recent search was not persisted");
    await this.#sql`
      delete from recent_search
      where id in (
        select id from (
          select id from recent_search
          where user_id = ${userId}
          order by created_at desc, id desc
          limit 18446744073709551615 offset 20
        ) as overflow
      )
    `;
    return {
      originalQuery: query,
      conditions,
      needsClarification: conditions.length === 0,
      ...(conditions.length === 0
        ? { example: "서울의 3년 이상 TypeScript 백엔드 원격 채용" }
        : {}),
      recentSearchId,
    };
  }

  async deleteRecentSearch(userId: string, recentSearchId: string): Promise<void> {
    const rows = await this.#sql<IdRow[]>`
      delete from recent_search
      where id = ${recentSearchId} and user_id = ${userId}
      returning id
    `;
    if (!rows[0]) throw new JobMarketError(404, "recent search not found");
  }

  async saveSearch(userId: string, input: SaveJobSearch) {
    const counts = await this.#sql<CountRow[]>`
      select count(*) as count from saved_search where user_id = ${userId}
    `;
    if (Number(counts[0]?.count ?? 0) >= 10) {
      throw new JobMarketError(409, "saved search limit exceeded", { limit: 10 });
    }
    const rows = await this.#sql<SavedSearchRow[]>`
      insert into saved_search (user_id, name, query_text, filters, notify)
      values (
        ${userId}, ${input.name}, ${input.originalQuery},
        ${this.#sql.json({ conditions: input.conditions } as JSONValue)},
        ${input.notify}
      )
      returning *
    `;
    const saved = rows[0];
    if (!saved) throw new Error("saved search was not persisted");
    return mapSavedSearch(saved);
  }

  async listSavedSearches(userId: string) {
    const rows = await this.#sql<SavedSearchRow[]>`
      select * from saved_search where user_id = ${userId}
      order by created_at, id
    `;
    return rows.map(mapSavedSearch);
  }

  async upsertInterest(
    userId: string,
    jobPostingId: string,
    input: UpsertJobInterest,
  ) {
    const postings = await this.#sql<IdRow[]>`
      select id from job_posting where id = ${jobPostingId}
    `;
    if (!postings[0]) throw new JobMarketError(404, "job posting not found");
    await this.#sql`
      insert into interest (user_id, job_posting_id, stage, deadline_at, memo)
      values (
        ${userId}, ${jobPostingId}, ${input.stage},
        ${input.deadlineAt ? new Date(input.deadlineAt) : null}, ${input.memo}
      )
      as new on duplicate key update stage = new.stage,
        deadline_at = new.deadline_at,
        memo = new.memo,
        updated_at = now(6)
    `;
    const rows = await this.#sql<{
      id: string;
      stage: string;
      deadline_at: Date | string | null;
      memo: string | null;
    }[]>`
      select id, stage, deadline_at, memo from interest
      where user_id = ${userId} and job_posting_id = ${jobPostingId}
    `;
    const interest = rows[0];
    if (!interest) throw new Error("job interest was not persisted");
    return {
      id: interest.id,
      jobPostingId,
      stage: interest.stage,
      deadlineAt: interest.deadline_at
        ? new Date(interest.deadline_at).toISOString()
        : null,
      memo: interest.memo,
    };
  }

  async computeMatch(userId: string, jobPostingId: string, at = new Date()) {
    const postings = await this.#sql<PostingRow[]>`
      select id, requirements from job_posting where id = ${jobPostingId}
    `;
    const posting = postings[0];
    if (!posting) throw new JobMarketError(404, "job posting not found");
    const requirements = JobRequirementsSchema.parse(posting.requirements);
    const records = await this.#sql<RecordSearchRow[]>`
      select title, body_md, properties
      from record
      where user_id = ${userId} and deleted_at is null
      order by id
    `;
    if (records.length < 3) {
      throw new JobMarketError(409, "more career records are required", {
        required: 3,
        actual: records.length,
      });
    }
    const searchText = records
      .map((record) => `${record.title}\n${record.body_md}\n${JSON.stringify(record.properties)}`)
      .join("\n");
    const match = calculateExplainableMatch(
      jobPostingId,
      requirements,
      searchText,
      at,
    );
    // 요건을 하나도 읽지 못했으면 점수를 만들지 않는다 — 화면은 점수 자리를
    // 비우고, 목록 API는 이 공고를 `match: null`로 내려보낸다.
    if (!match) {
      throw new JobMarketError(409, "job posting requirements are not extracted yet", {
        jobPostingId,
      });
    }
    await this.#sql`
      insert into match_score (
        user_id, job_posting_id, total, axes,
        reason_text, next_action, computed_at
      )
      values (
        ${userId}, ${jobPostingId}, ${match.total},
        ${this.#sql.json(match.axes as JSONValue)},
        ${match.reason}, ${match.nextAction}, ${at}
      )
      as new on duplicate key update total = new.total,
        axes = new.axes,
        reason_text = new.reason_text,
        next_action = new.next_action,
        computed_at = new.computed_at
    `;
    const rows = await this.#sql<{ computed_at: Date | string }[]>`
      select computed_at from match_score
      where user_id = ${userId} and job_posting_id = ${jobPostingId}
    `;
    if (!rows[0]) throw new Error("job match was not persisted");
    return ExplainableMatchSchema.parse(match);
  }

  async summarizeDemand(jobPostingIds: string[]) {
    if (jobPostingIds.length === 0) {
      return JobDemandSummarySchema.parse({ sampleSize: 0, demandRatios: null });
    }
    const rows = await this.#sql<RequirementPostingRow[]>`
      select id, requirements from job_posting
      where id in ${this.#sql(jobPostingIds)}
    `;
    if (rows.length < 5) {
      return JobDemandSummarySchema.parse({
        sampleSize: rows.length,
        demandRatios: null,
      });
    }
    const counts = new Map<string, number>();
    for (const row of rows) {
      const requirements: JobRequirements = JobRequirementsSchema.parse(row.requirements);
      for (const technology of new Set(requirements.technologies.map((value) =>
        value.toLocaleLowerCase("en-US")))) {
        counts.set(technology, (counts.get(technology) ?? 0) + 1);
      }
    }
    return JobDemandSummarySchema.parse({
      sampleSize: rows.length,
      demandRatios: Object.fromEntries(
        [...counts.entries()].sort(([left], [right]) => left.localeCompare(right))
          .map(([key, count]) => [key, count / rows.length]),
      ),
    });
  }
}
